#!/usr/bin/env node
// @ts-check
import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import url from 'node:url'
import readline from 'node:readline'
import { Readable, Writable } from 'node:stream'

import TOML from 'smol-toml'
import handlebarsImport from 'handlebars'
import { consola } from 'consola'
import markdownit from 'markdown-it'
import { full as markdownEmoji } from 'markdown-it-emoji'
import Shiki from '@shikijs/markdown-it'
import { listen } from 'listhen'
import {
	createApp,
	createError,
	createRouter,
	defineEventHandler,
	setResponseStatus,
	serveStatic,
	sendStream,
	setResponseHeaders,
	toNodeListener,
} from 'h3'
import mime from 'mime-types'

import { markedLinks } from './marked.js'

export { consola }

const Config = await import(path.join(process.cwd(), 'ten.config.js'))
const Defaults = Config.defaults
const _ctx = Config.ctx

/**
 * @typedef {typeof _ctx} Ctx
 *
 * @typdef {Object} Options
 * @property {string} command
 * @property {boolean} clean
 * @property {boolean} verbose
 *
 * @typedef {'build' | 'serve' | 'new'} Subcommands
 *
 * @typedef {Object} TenJsMeta
 * @property {string} [slug]
 * @property {string} [layout]
 *
 * @typedef {{ slug: string, count: number }[]} TenJsSlugMapping
 *
 * @typedef {Object} TenJs
 * @property {() => Promise<TenJsMeta>} [Meta]
 * @property {(arg0: Ctx) => Promise<any>} [Header]
 * @property {(arg0: Ctx) => Promise<TenJsSlugMapping>} [GenerateSlugMapping]
 * @property {(arg0: Ctx, arg1: { slug?: string, count?: number }) => Promise<any>} [GenerateTemplateVariables]
 *
 * @typedef {Object} Page
 * @property {string} inputFile
 * @property {string} inputUri
 * @property {string} outputUri
 * @property {string} entrypointUri
 * @property {TenJs} tenJs
 * @property {Record<PropertyKey, any>} parameters
 *
 * @typedef {Object} Frontmatter
 * @property {string} title
 * @property {string} author
 * @property {Date} date
 * @property {string} [layout]
 * @property {string} [slug]
 * @property {string[]} [categories]
 * @property {string[]} [tags]
 */

const ShikiInstance = await Shiki({
	themes: {
		light: 'github-light',
		dark: 'github-dark',
	},
})
export const MarkdownItInstance = (() => {
	const md = markdownit({
		html: true,
		typographer: true,
		linkify: true,
	})
	md.use(ShikiInstance)
	md.use(markdownEmoji)
	md.use(markedLinks)
	return md
})()
let /** @type {typeof import('handlebars')} */ HandlebarsInstance = /** @type {any} */ (null)
globalThis.MarkdownItInstance = MarkdownItInstance // TODO
const /** @type {string[]} */ FileQueue = []
const /** @type {Map<string, string>} */ ContentMap = new Map()
const OriginalHandlebarsHelpers = Object.keys(handlebarsImport.helpers)

if (
	(function isTopLevel() {
		// https://stackoverflow.com/a/66309132
		const pathToThisFile = path.resolve(url.fileURLToPath(import.meta.url))
		const pathPassedToNode = path.resolve(process.argv[1])
		const isTopLevel = pathToThisFile.includes(pathPassedToNode)
		return isTopLevel
	})()
) {
	await main()
}

export async function main() {
	const helpText = `ten <build | serve | new> [options]
  Options:
    -h, --help
    --clean
    --verbose`

	const { values, positionals } = util.parseArgs({
		allowPositionals: true,
		options: {
			clean: { type: 'boolean', default: false },
			verbose: { type: 'boolean', default: false },
			help: { type: 'boolean', default: false, alias: 'h' },
		},
	})

	const ctx = {
		options: {
			command: /** @type {Subcommands} */ (positionals[0]),
			clean: /** @type {boolean} */ (values.clean), // TODO: Boolean not inferred
			verbose: /** @type {boolean} */ (values.verbose),
		},
		handlebarsHelpers: _ctx.handlebarsHelpers,
		helpers: _ctx.helpers
	}

	if (!ctx.options.command) {
		console.error(helpText)
		consola.error('No command provided.')
		process.exit(1)
	}

	if (values.help) {
		consola.info(helpText)
		process.exit(0)
	}

	if (ctx.options.command === 'serve') {
		await commandServe(ctx)
	} else if (ctx.options.command === 'build') {
		await commandBuild(ctx)
	} else if (ctx.options.command === 'new') {
		await commandNew(ctx)
	} else {
		console.error(helpText)
		consola.error(`Unknown command: ${positionals[0]}`)
		process.exit(1)
	}
}

async function commandServe(/** @type {Ctx} */ ctx) {
	await fsRegisterHandlebarsHelpers(ctx)
	await fsPopulateContentMap(ctx)

	const app = createApp()
	const router = createRouter()
	app.use(router)

	router.use(
		'/**',
		defineEventHandler(async (event) => {
			try {
				const outputUri = event.path.endsWith('/')
					? `${event.path}index.html`
					: event.path
				const inputUri = ContentMap.get(outputUri)

				setResponseHeaders(event, {
					'Content-Type': mime.lookup(outputUri) || 'text/html',
					'Cache-Control': 'no-cache',
					Expires: '0',
					'Transfer-Encoding': 'chunked',
				})

				if (inputUri) {
					// TODO: Fix this
					let content = ''
					const writable2 = new WritableStream({
						write(chunk) {
							content += chunk
						},
					})

					const inputFile = path.join(Defaults.contentDir, inputUri)
					for await (const page of yieldPagesFromInputFile(
						ctx,
						inputFile
					)) {
						const rootRelUri = path.relative(
							Defaults.rootDir,
							path.join(Defaults.contentDir, page.inputUri)
						)
						consola.info(
							`Request (content): ${event.path}  -> ${rootRelUri}`
						)

						await handleContentFile(ctx, page, writable2)
					}

					const readable2 = Readable.from(content)
					return sendStream(event, readable2)
				} else {
					const rootRelUri = path.relative(
						Defaults.rootDir,
						path.join(Defaults.staticDir, event.path)
					)
					consola.info('Request (static):', rootRelUri)

					return serveStatic(event, {
						getContents(id) {
							return fs.readFile(path.join(Defaults.staticDir, id))
						},
						async getMeta(id) {
							const stats = await fs
								.stat(path.join(Defaults.staticDir, id))
								.catch(() => null)

							if (!stats?.isFile()) {
								return
							}

							return {
								size: stats.size,
								mtime: stats.mtimeMs,
							}
						},
					})
				}
			} catch (err) {
				console.error(err)
			}
		})
	)

	const listener = await listen(toNodeListener(app), {
		port: process.env.PORT ?? 3001,
		showURL: false,
	})
	consola.start(`Listening at http://localhost:${listener.address.port}`)

	process.on('SIGINT', async () => {
		await listener.close()
	})
}

export async function commandBuild(/** @type {Ctx} */ ctx) {
	if (ctx.options.clean) {
		await fsClearBuildDirectory(ctx)
	}
	await fsRegisterHandlebarsHelpers(ctx)
	await addAllContentFilesToFileQueue(ctx)
	await iterateFileQueueByWhileLoop(ctx)
	await fsCopyStaticFiles(ctx)
	consola.success('Done.')
}

async function commandNew(/** @type {Ctx} */ ctx) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	rl.on('SIGINT', () => {
		consola.error('Aborting...')
		rl.close()
		process.exit(1)
	})
	rl.on('SIGCONT', () => {
		commandNew(ctx)
	})
	rl.question[util.promisify.custom] = (/** @type {string} */ query) => {
		return new Promise((resolve) => {
			rl.question(query, resolve)
		})
	}

	const slug = /** @type {string} */ /** @type {any} */ (
		await util.promisify(rl.question)(`What is the post slug? `)
	)
	const date = new Date()
		.toISOString()
		.replace('T', ' ')
		.replace(/\.[0-9]+Z$/, 'Z')
	const markdownFile = path.join(
		Defaults.contentDir,
		'posts/drafts',
		`${slug}/${slug}.md`
	)
	await fs.mkdir(path.dirname(markdownFile), { recursive: true })
	await fs.writeFile(
		markdownFile,
		`+++
title = ''
slug = '${slug}'
author = 'Edwin Kofler'
date = ${date}
categories = []
tags = []
draft = true
+++

`
	)
	rl.close()
	consola.info(`File created at ${markdownFile}`)
}

async function iterateFileQueueByCallback(
	/** @type {Ctx} */ ctx,
	{
		onEmptyFileQueue = /** @type {() => void | Promise<void>} */ () => {},
	} = {}
) {
	let lastCallbackWasEmpty = false
	await cb()

	async function cb() {
		if (FileQueue.length > 0) {
			const inputFile = path.join(Defaults.contentDir, FileQueue[0])
			for await (const page of yieldPagesFromInputFile(ctx, inputFile)) {
				const outputUrl = path.join(Defaults.outputDir, page.outputUri)

				await fs.mkdir(path.dirname(outputUrl), { recursive: true })
				const outputStream = fss.createWriteStream(outputUrl)
				await handleContentFile(ctx, page, Writable.toWeb(outputStream))
			}

			FileQueue.splice(0, 1)
			lastCallbackWasEmpty = false
		} else {
			if (!lastCallbackWasEmpty) {
				await onEmptyFileQueue()
				lastCallbackWasEmpty = true
			}
		}

		setImmediate(cb)
	}
}

async function iterateFileQueueByWhileLoop(/** @type {Ctx} */ ctx) {
	while (FileQueue.length > 0) {
		const inputFile = path.join(Defaults.contentDir, FileQueue[0])
		for await (const page of yieldPagesFromInputFile(ctx, inputFile)) {
			const outputUrl = path.join(Defaults.outputDir, page.outputUri)

			await fs.mkdir(path.dirname(outputUrl), { recursive: true })
			const outputStream = fss.createWriteStream(outputUrl)
			await handleContentFile(ctx, page, Writable.toWeb(outputStream))
		}

		FileQueue.splice(0, 1)
	}
}

/** @returns {AsyncGenerator<Page>} */
async function* yieldPagesFromInputFile(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputFile
) {
	const inputUri = path.relative(Defaults.contentDir, inputFile)
	const entrypointUri = await utilGetEntrypointFromInputUri(ctx, inputFile)
	const tenJs = await utilExtractTenJs(ctx, entrypointUri)
	const outputUri = await convertInputUriToOutputUri(
		ctx,
		inputUri,
		tenJs,
		entrypointUri
	)

	/** @type {Page} */
	const page = {
		inputFile,
		inputUri,
		outputUri,
		entrypointUri,
		tenJs,
		parameters: {},
	}

	if (page.tenJs.GenerateSlugMapping) {
		const slugMap = (await page.tenJs.GenerateSlugMapping(ctx)) ?? []
		const originalOutputUri = page.outputUri
		for (const slug of slugMap) {
			const data =
				(await page.tenJs?.GenerateTemplateVariables?.(ctx, {
					slug: slug.slug,
					count: slug.count,
				})) ?? {}

			page.outputUri = path.join(
				path.dirname(originalOutputUri),
				slug.slug,
				'index.html'
			)
			page.parameters = data

			yield page
		}
	} else {
		const data =
			(await page.tenJs?.GenerateTemplateVariables?.(ctx, {})) ?? {}
		page.parameters = data

		yield page
	}
}

async function handleContentFile(
	/** @type {Ctx} */ ctx,
	/** @type {Page} */ page,
	/** @type {WritableStream} */ outputStream
) {
	if (page.inputUri != page.entrypointUri) {
		await handleNonEntrypoint(ctx, page, outputStream)
	} else if (page.entrypointUri) {
		await handleEntrypoint(ctx, page, outputStream)
	} else {
		consola.warn(`No content file found for ${page.inputUri}`)
	}
}

async function handleEntrypoint(
	/** @type {Ctx} */ ctx,
	/** @type {Page} */ page,
	/** @type {WritableStream} */ outputStream
) {
	consola.log(`Processing ${page.entrypointUri}...`)
	if (
		// prettier-ignore
		page.inputUri.includes('/_') ||
		page.inputUri.includes('_/')
	) {
		// Do not copy file.
	} else if (page.inputUri.includes('/drafts/')) {
		// Do not copy file.
		// TODO: This should be replaced with something
	} else if (page.entrypointUri.endsWith('.md')) {
		let markdown = await fs.readFile(
			path.join(Defaults.contentDir, page.entrypointUri),
			'utf-8'
		)
		const { html, frontmatter } = (() => {
			let frontmatter = {}
			markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
				frontmatter = TOML.parse(toml)
				return ''
			})

			return {
				html: MarkdownItInstance.render(markdown),
				frontmatter: Config.validateFrontmatter(
					path.join(Defaults.contentDir, page.entrypointUri),
					frontmatter
				),
			}
		})()

		const layout = await utilExtractLayout(ctx, [
			frontmatter?.layout,
			await Config?.getLayout?.(ctx, page),
			ctx?.defaults?.layout,
			'default.hbs',
		])
		const template = HandlebarsInstance.compile(layout, {
			noEscape: true,
		})
		const templatedHtml = template({
			__title: frontmatter.title,
			__body: html,
			__inputUri: page.entrypointUri,
		})

		await outputStream.getWriter().write(templatedHtml)
		consola.log(`  -> Written to ${page.outputUri}`)
	} else if (
		page.entrypointUri.endsWith('.html') ||
		page.entrypointUri.endsWith('.xml')
	) {
		let html = await fs.readFile(
			path.join(Defaults.contentDir, page.entrypointUri),
			'utf-8'
		)
		const template = HandlebarsInstance.compile(html, {
			noEscape: true,
		})
		let templatedHtml = template({
			...page.parameters,
			__inputUri: page.entrypointUri,
		})
		const meta = await page.tenJs?.Meta?.()
		const header = await page.tenJs?.Header?.(ctx)
		const layout = await utilExtractLayout(ctx, [
			meta?.layout,
			await Config?.getLayout?.(ctx, page),
			ctx?.defaults?.layout,
			'default.hbs',
		])

		templatedHtml = HandlebarsInstance.compile(layout, {
			noEscape: true,
		})({
			__body: templatedHtml,
			__header_title: header?.title ?? ctx?.defaults?.title ?? 'Website',
			__header_content: header?.content ?? '',
			__inputUri: page.entrypointUri,
		})

		await outputStream.getWriter().write(templatedHtml)
		consola.log(`  -> Written to ${page.outputUri}`)
	}
}

async function handleNonEntrypoint(
	/** @type {Ctx} */ ctx,
	/** @type {Page} */ page,
	/** @type {WritableStream} */ outputStream
) {
	if (
		page.inputUri.includes('/_') ||
		page.inputUri.includes('_/') ||
		path.parse(page.inputUri).name.endsWith('_') ||
		page.inputUri.endsWith('.ten.js')
	) {
		// Do not copy file.
	} else if (page.inputUri.includes('/drafts/')) {
		// Do not copy file.
		// TODO: This should be replaced with something
	} else if (page.inputUri.match(/\.[a-zA-Z]+\.js$/)) {
		throw new Error(
			`Did you mean to append ".ten.js" for file: ${page.inputFile}?`
		)
	} else {
		// const readable = Readable.toWeb(fss.createReadStream(page.inputFile))
		// readable.pipeTo(outputStream)
		const content = await fs.readFile(page.inputFile, 'utf-8')
		outputStream.getWriter().write(content)
	}
}

async function fsCopyStaticFiles(/** @type {Ctx} */ ctx) {
	try {
		await fs.cp(Defaults.staticDir, Defaults.outputDir, {
			recursive: true,
		})
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsClearBuildDirectory(/** @type {Ctx} */ ctx) {
	consola.info('Clearing build directory...')
	try {
		await fs.rm(Defaults.outputDir, { recursive: true })
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsPopulateContentMap(/** @type {Ctx} */ ctx) {
	await walk(Defaults.contentDir)

	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const subdir = path.join(entry.parentPath, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(entry.parentPath, entry.name)
				for await (const page of yieldPagesFromInputFile(ctx, inputFile)) {
					consola.log(`Adding ${page.outputUri} -> ${page.inputUri}`)
					ContentMap.set(page.outputUri, page.inputUri)
				}
			}
		}
	}
}

async function fsRegisterHandlebarsHelpers(/** @type {Ctx} */ ctx) {
	const handlebars = handlebarsImport.create()

	// Re-register partials.
	for (const partial in handlebars.partials) {
		handlebars.unregisterPartial(partial)
	}
	try {
		for (const partialFilename of await fs.readdir(
			Defaults.partialsDir
		)) {
			const partialContent = await fs.readFile(
				path.join(Defaults.partialsDir, partialFilename),
				'utf-8'
			)

			handlebars.registerPartial(
				path.parse(partialFilename).name,
				partialContent
			)
		}
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}

	// Re-register helpers.
	for (const helper in Config.handlebarsHelpers) {
		if (OriginalHandlebarsHelpers.includes(helper)) continue

		handlebars.unregisterHelper(helper)
	}
	for (const helper in Config.handlebarsHelpers) {
		handlebars.registerHelper(helper, Config.handlebarsHelpers[helper])
	}

	HandlebarsInstance = handlebars
}

async function addAllContentFilesToFileQueue(/** @type {Ctx} */ ctx) {
	await walk(Defaults.contentDir)
	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const subdir = path.join(dir, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(entry.parentPath, entry.name)
				const inputUri = path.relative(Defaults.contentDir, inputFile)
				FileQueue.push(inputUri)
			}
		}
	}
}

async function convertInputUriToOutputUri(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputUri,
	/** @type {TenJs} */ tenJs,
	/** @type {string | null} */ entrypointUri
) {
	if (Config?.transformUri) {
		inputUri = Config.transformUri(inputUri)
	}
	inputUri = '/' + inputUri // TODO

	// For an `inputFile` of `/a/b/c.txt`, this extracts `/a`.
	const pathPart = path.dirname(path.dirname(inputUri))
	// For an `inputFile` of `/a/b/c.txt`, this extracts `b`.
	const parentDirname = path.basename(path.dirname(inputUri))

	// If `parentDirname` is a "file".
	if (parentDirname.includes('.') && parentDirname !== '.') {
		return path.join(pathPart, path.parse(inputUri).base)
	} else if (!inputUri.endsWith('.html') && !inputUri.endsWith('.md')) {
		const relPart = await getNewParentDirname()
		return path.join(pathPart, relPart, path.parse(inputUri).base)
	} else if (path.parse(inputUri).name === parentDirname) {
		const parentDirname = await getNewParentDirname()
		return path.join(pathPart, parentDirname, 'index.html')
	} else {
		const relPart = await getNewParentDirname()
		return path.join(pathPart, relPart, path.parse(inputUri).name + '.html')
	}

	async function getNewParentDirname() {
		const inputFile = path.join(Defaults.contentDir, inputUri)

		const meta = await tenJs?.Meta?.()
		if (meta?.slug) {
			return meta.slug
		}

		if (entrypointUri) {
			const frontmatter = await extractContentFileFrontmatter(
				ctx,
				inputFile,
				entrypointUri
			)
			return frontmatter.slug ?? path.basename(path.dirname(inputUri))
		} else {
			return path.basename(path.dirname(inputUri))
		}
	}
}

async function extractContentFileFrontmatter(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputFile,
	/** @type {string} */ entrypointUri
) {
	if (!inputFile) return {}
	const entrypointFile = path.join(Defaults.contentDir, entrypointUri)

	let markdown
	try {
		markdown = await fs.readFile(entrypointFile, 'utf-8')
	} catch {
		return {}
	}

	let frontmatter = {}
	markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
		frontmatter = TOML.parse(toml)
		return ''
	})

	return Config.validateFrontmatter(entrypointFile, frontmatter)
}

async function utilExtractLayout(
	/** @type {Ctx} */ ctx,
	/** @type {any[]} */ layouts
) {
	for (const layout of layouts) {
		if (layout instanceof Buffer) {
			return layout.toString()
		} else if (typeof layout === 'string') {
			return await fs.readFile(
				path.join(Defaults.layoutDir, layout),
				'utf-8'
			)
		}
	}
}

async function utilExtractTenJs(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ entrypointUri
) {
	const entrypointFile = path.join(Defaults.contentDir, entrypointUri)

	try {
		const javascriptFile = path.join(
			path.dirname(entrypointFile),
			path.parse(entrypointFile).base + '.ten.js'
		)
		let /** @type {TenJs} */ tenJs = await import(javascriptFile)
		return tenJs
	} catch (err) {
		if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
	}
	return {}
}

async function utilGetEntrypointFromInputUri(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputFile
) {
	const inputUri = path.relative(Defaults.contentDir, inputFile)
	const dirname = path.basename(path.dirname(inputUri))
	// prettier-ignore
	let fileUris = [
		'index.md',
		'index.html',
		'index.xml',
	]
	if (dirname !== '.') {
		// prettier-ignore
		fileUris = fileUris.concat([
			dirname + '.md',
			dirname + '.html',
			dirname + '.xml',
			dirname,
		])
	}

	// Search for a valid "content file" in the same directory.
	for (const uri of fileUris) {
		const file = path.join(path.dirname(inputFile), uri)
		if (['.md', '.html', '.xml'].includes(path.parse(uri).ext)) {
			try {
				await fs.stat(file)
				return path.relative(Defaults.contentDir, file)
			} catch {}
		}
	}

	throw new Error(`No entrypoint found for file: ${inputFile}`)
}

async function utilFileExists(/** @type {string} */ file) {
	return await fs
		.stat(file)
		.then(() => true)
		.catch(() => false)
}
