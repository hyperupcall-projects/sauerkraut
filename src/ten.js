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
	createRouter,
	defineEventHandler,
	serveStatic,
	sendStream,
	setResponseHeaders,
	toNodeListener,
} from 'h3'
import mime from 'mime-types'
import * as v from 'valibot'

import { markedLinks } from './marked.js'

export { consola }

/**
 * @typedef {import('handlebars')} Handlebars
 * @typedef {import('./ten.d.ts').Config} Config
 * @typedef {import('./ten.d.ts').TenFile} TenFile
 * @typedef {import('./ten.d.ts').TenRoute} TenRoute
 * @typedef {import('./ten.d.ts').Options} Options
 * @typedef {import('./ten.d.ts').Page} Page
 * @typedef {import('./ten.d.ts').Frontmatter} Frontmatter
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
let /** @type {Handlebars} */ HandlebarsInstance = /** @type {any} */ (null)
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
	const helpText = `ten [--dir|-D=...] <build | serve | new> [options]
  Options:
    -h, --help
    --clean
    --verbose`

	const { values, positionals } = util.parseArgs({
		allowPositionals: true,
		options: {
			dir: { type: 'string', default: '.', alias: 'D' },
			clean: { type: 'boolean', default: false },
			verbose: { type: 'boolean', default: false },
			help: { type: 'boolean', default: false, alias: 'h' },
		},
	})
	const /** @type {Options} */ options = {
		dir: /** @type {string} */ (values.dir),
		command: /** @type {Options['command']} */ (positionals[0]),
		clean: /** @type {boolean} */ (values.clean), // TODO: Boolean not inferred
		verbose: /** @type {boolean} */ (values.verbose),
	}

	if (!options.command) {
		console.error(helpText)
		consola.error('No command provided.')
		process.exit(1)
	}

	if (values.help) {
		consola.info(helpText)
		process.exit(0)
	}

	if (options.command !== 'serve' && options.command !== 'watch' && options.command !== 'build' && options.command !== 'new') {
		console.error(helpText)
		if (!positionals[0]) {
			consola.error(`No command passed`)
		} else {
			consola.error(`Unknown command: ${positionals[0]}`)
		}
		process.exit(1)
	}

	const configFile = path.join(process.cwd(), /** @type {string} */ (values.dir), 'ten.config.js')
	if (!(await utilFileExists('./ten.config.js'))) {
		consola.error(`File "ten.config.js" not found for project: "${path.dirname(configFile)}"`)
		process.exit(1)
	}

	const /** @type {Config} */ config = await import(configFile)
	const ConfigSchema = v.object({
		defaults: v.strictObject({
			title: v.string(),
			layout: v.string(),
			rootDir: v.string(),
			cacheFile: v.string(),
			contentDir: v.string(),
			layoutDir: v.string(),
			partialDir: v.string(),
			staticDir: v.string(),
			outputDir: v.string()
		}),
		transformUri: v.optional(v.function()),
		validateFrontmatter: v.optional(v.function()),
		handlebearsHelpers: v.optional(v.record(v.string(), v.function())),
		tenHelpers: v.optional(v.record(v.string(), v.function()))
	})
	const result = v.safeParse(ConfigSchema, config)
	if (!result.success) {
		consola.error(`Failed to parse config file: "${configFile}"`)

		const flatErrors = v.flatten(result.issues)
		console.log(flatErrors)
		process.exit(1)
	}

	if (options.command === 'serve') {
		await commandServe(config, options)
	} else if (options.command === 'watch') {
		await commandWatch(config, options)
	} else if (options.command === 'build') {
		await commandBuild(config, options)
	} else if (options.command === 'new') {
		await commandNew(config, options)
	}
}

async function commandServe(/** @type {Config} */ config, /** @type {Options} */ options) {
	await fsRegisterHandlebarsHelpers(config, options)
	await fsPopulateContentMap(config, options)

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

					const inputFile = path.join(config.defaults.contentDir, inputUri)
					for await (const page of yieldPagesFromInputFile(
						config, options,
						inputFile
					)) {
						const rootRelUri = path.relative(
							options.dir,
							path.join(config.defaults.contentDir, page.inputUri)
						)
						consola.info(
							`Request (content): ${event.path}  -> ${rootRelUri}`
						)

						await handleContentFile(config, options, page, writable2)
					}

					const readable2 = Readable.from(content)
					return sendStream(event, readable2)
				} else {
					const rootRelUri = path.relative(
						options.dir,
						path.join(config.defaults.staticDir, event.path)
					)
					consola.info('Request (static):', rootRelUri)

					return serveStatic(event, {
						getContents(id) {
							return fs.readFile(path.join(config.defaults.staticDir, id))
						},
						async getMeta(id) {
							const stats = await fs
								.stat(path.join(config.defaults.staticDir, id))
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

export async function commandWatch(/** @type {Config} */ config, /** @type {Options} */ options) {
	console.log('build')
}

export async function commandBuild(/** @type {Config} */ config, /** @type {Options} */ options) {
	if (options.clean) {
		await fsClearBuildDirectory(config, options)
	}
	await fsRegisterHandlebarsHelpers(config, options)
	await addAllContentFilesToFileQueue(config, options)
	await iterateFileQueueByWhileLoop(config, options)
	await fsCopyStaticFiles(config, options)
	consola.success('Done.')
}

async function commandNew(/** @type {Config} */ config, /** @type {Options} */ options) {
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
		commandNew(config, options)
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
		config.defaults.contentDir,
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
	/** @type {Config} */ config, /** @type {Options} */ options,
	{
		onEmptyFileQueue = /** @type {() => void | Promise<void>} */ () => {},
	} = {}
) {
	let lastCallbackWasEmpty = false
	await cb()

	async function cb() {
		if (FileQueue.length > 0) {
			const inputFile = path.join(config.defaults.contentDir, FileQueue[0])
			for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
				const outputUrl = path.join(config.defaults.outputDir, page.outputUri)

				await fs.mkdir(path.dirname(outputUrl), { recursive: true })
				const outputStream = fss.createWriteStream(outputUrl)
				await handleContentFile(config, options, page, Writable.toWeb(outputStream))
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

async function iterateFileQueueByWhileLoop(/** @type {Config} */ config, /** @type {Options} */ options) {
	while (FileQueue.length > 0) {
		const inputFile = path.join(config.defaults.contentDir, FileQueue[0])
		for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
			const outputUrl = path.join(config.defaults.outputDir, page.outputUri)

			await fs.mkdir(path.dirname(outputUrl), { recursive: true })
			const outputStream = fss.createWriteStream(outputUrl)
			await handleContentFile(config, options, page, Writable.toWeb(outputStream))
		}

		FileQueue.splice(0, 1)
	}
}

/** @returns {AsyncGenerator<Page>} */
async function* yieldPagesFromInputFile(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {string} */ inputFile
) {
	const inputUri = path.relative(config.defaults.contentDir, inputFile)
	const [tenFile, tenRoute] = await utilImportJs(config, options, inputFile)
	const outputUri = await convertInputUriToOutputUri(
		config, options,
		inputUri,
		tenFile,
		tenRoute
	)

	/** @type {Page} */
	const page = {
		inputFile,
		inputUri,
		tenFile,
		tenRoute,
		parameters: {},
		outputUri,
	}

	if (page.tenFile?.GenerateSlugMapping) {
		const slugMap = (await page.tenFile.GenerateSlugMapping({ config, options })) ?? []
		const originalOutputUri = page.outputUri
		for (const slug of slugMap) {
			const data =
				(await page.tenFile?.GenerateTemplateVariables?.({ config, options }, {
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
			(await page.tenFile?.GenerateTemplateVariables?.({ config, options }, {})) ?? {}
		page.parameters = data

		yield page
	}
}

async function handleContentFile(
	/** @type {Config} */ config, /** @type {Options} */ options,
	/** @type {Page} */ page,
	/** @type {WritableStream} */ outputStream
) {
	if (!page.inputUri) {
		consola.warn(`No content file found for ${page.inputUri}`)
		return
	}

	consola.log(`Processing ${page.inputUri}...`)
	if (
		// prettier-ignore
		page.inputUri.includes('/_') ||
		page.inputUri.includes('_/'),
		path.parse(page.inputUri).name.endsWith('_') ||
		page.inputUri.endsWith('.ten.js')
	) {
		// Do not copy file.
	} else if (page.inputUri.includes('/drafts/')) {
		// Do not copy file.
		// TODO: This should be replaced with something
	} else if (page.inputUri.endsWith('.md')) {
		let markdown = await fs.readFile(
			path.join(config.defaults.contentDir, page.inputUri),
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
				frontmatter: /** @type {Frontmatter} */ (config.validateFrontmatter(
					path.join(config.defaults.contentDir, page.inputUri),
					frontmatter
				)),
			}
		})()

		const layout = await utilExtractLayout(config, options, [
			frontmatter?.layout,
			await config?.getLayout?.(config, options, page),
			config?.defaults?.layout,
			'default.hbs',
		])
		const template = HandlebarsInstance.compile(layout, {
			noEscape: true,
		})
		const templatedHtml = template({
			__title: frontmatter.title,
			__body: html,
			__inputUri: page.inputUri,
		})

		await outputStream.getWriter().write(templatedHtml)
		consola.log(`  -> Written to ${page.outputUri}`)
	} else if (
		page.inputUri.endsWith('.html') ||
		page.inputUri.endsWith('.xml')
	) {
		let html = await fs.readFile(
			path.join(config.defaults.contentDir, page.inputUri),
			'utf-8'
		)
		const template = HandlebarsInstance.compile(html, {
			noEscape: true,
		})
		let templatedHtml = template({
			...page.parameters,
			__inputUri: page.inputUri,
		})
		const meta = await page.tenFile?.Meta?.({ config, options })
		const header = await page.tenFile?.Header?.(config, options)
		const layout = await utilExtractLayout(config, options, [
			meta?.layout,
			await config?.getLayout?.(config, options, page),
			config?.defaults?.layout,
			'default.hbs',
		])

		templatedHtml = HandlebarsInstance.compile(layout, {
			noEscape: true,
		})({
			__body: templatedHtml,
			__header_title: header?.title ?? config?.defaults?.title ?? 'Website',
			__header_content: header?.content ?? '',
			__inputUri: page.inputUri,
		})

		await outputStream.getWriter().write(templatedHtml)
		consola.log(`  -> Written to ${page.outputUri}`)
	} else if (page.inputUri.endsWith('.cards.json')) {
		let json = await fs.readFile(
			path.join(config.defaults.contentDir, page.inputUri),
									 'utf-8'
		)

		const flashcardsHtml = await fs.readFile(path.join(import.meta.dirname, '../resources/flashcards-page/flashcards.html'), 'utf-8')
		const template = HandlebarsInstance.compile(flashcardsHtml, {
			noEscape: true,
		})
		let templatedHtml = template({
			...page.parameters,
			__inputUri: page.inputUri,
			__flashcard_data: json
		})

		await outputStream.getWriter().write(templatedHtml)
		consola.log(`  -> Written to ${page.outputUri}`)
	} else {
		// TODO
		// const readable = Readable.toWeb(fss.createReadStream(page.inputFile))
		// readable.pipeTo(outputStream)
		const content = await fs.readFile(page.inputFile, 'utf-8')
		outputStream.getWriter().write(content)
	}
}

async function fsCopyStaticFiles(/** @type {Config} */ config, /** @type {Options} */ options) {
	try {
		await fs.cp(config.defaults.staticDir, config.defaults.outputDir, {
			recursive: true,
		})
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsClearBuildDirectory(/** @type {Config} */ config, /** @type {Options} */ options) {
	consola.info('Clearing build directory...')
	try {
		await fs.rm(config.defaults.outputDir, { recursive: true })
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsPopulateContentMap(/** @type {Config} */ config, /** @type {Options} */ options) {
	await walk(config.defaults.contentDir)

	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const subdir = path.join(entry.parentPath, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(entry.parentPath, entry.name)
				for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
					consola.log(`Adding ${page.inputUri} -> ${page.outputUri}`)
					ContentMap.set(page.outputUri, page.inputUri)
				}
			}
		}
	}
}

async function fsRegisterHandlebarsHelpers(/** @type {Config} */ config, /** @type {Options} */ options) {
	const handlebars = handlebarsImport.create()

	// Re-register partials.
	for (const partial in handlebars.partials) {
		handlebars.unregisterPartial(partial)
	}
	try {
		for (const partialFilename of await fs.readdir(
			config.defaults.partialDir
		)) {
			const partialContent = await fs.readFile(
				path.join(config.defaults.partialDir, partialFilename),
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
	for (const helper in config.handlebarsHelpers) {
		if (OriginalHandlebarsHelpers.includes(helper)) continue

		handlebars.unregisterHelper(helper)
	}
	for (const helper in config.handlebarsHelpers) {
		handlebars.registerHelper(helper, config.handlebarsHelpers[helper])
	}

	HandlebarsInstance = handlebars
}

async function addAllContentFilesToFileQueue(/** @type {Config} */ config, /** @type {Options} */ options) {
	await walk(config.defaults.contentDir)
	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const subdir = path.join(dir, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(entry.parentPath, entry.name)
				const inputUri = path.relative(config.defaults.contentDir, inputFile)
				FileQueue.push(inputUri)
			}
		}
	}
}

async function convertInputUriToOutputUri(
	/** @type {Config} */ config, /** @type {Options} */ options,
	/** @type {string} */ inputUri,
	/** @type {TenFile} */ tenFile,
	/** @type {TenRoute} */ tenRoute
) {
	if (config?.transformUri) {
		inputUri = config.transformUri(inputUri)
	}
	inputUri = '/' + inputUri // TODO
	if (inputUri.endsWith('.cards.json')) {
		console.log(inputUri)
		inputUri = inputUri.replace(/\.cards\.json$/, '.html')
	}

	// For an `inputFile` of `/a/b/c.txt`, this extracts `/a`.
	const pathPart = path.dirname(path.dirname(inputUri))

	// For an `inputFile` of `/a/b/c.txt`, this extracts `b`.
	const parentDirname = path.basename(path.dirname(inputUri))

	const relPart = await getNewParentDirname()

	if (!inputUri.endsWith('.html') && !inputUri.endsWith('.md')) {
		return path.join(pathPart, relPart, path.parse(inputUri).base)
	} else if (path.parse(inputUri).name === parentDirname) {
		return path.join(pathPart, relPart, 'index.html')
	} else {
		return path.join(pathPart, relPart, path.parse(inputUri).name + '.html')
	}

	async function getNewParentDirname() {
		const meta = await tenFile?.Meta?.({ config, options })
		if (meta?.slug) {
			return meta.slug
		}

		return tenRoute?.slug ?? path.basename(path.dirname(inputUri))
	}
}

async function utilExtractLayout(
	/** @type {Config} */ config, /** @type {Options} */ options,
	/** @type {(Buffer | string | undefined)[]} */ layouts
) {
	for (const layout of layouts) {
		if (layout === undefined || layout === '') {
			continue
		}

		if (layout instanceof Buffer) {
			return layout.toString()
		} else if (typeof layout === 'string') {
			return await fs.readFile(
				path.join(config.defaults.layoutDir, layout),
				'utf-8'
			)
		}
	}
}

/** @returns {Promise<[TenFile, TenRoute]>} */
async function utilImportJs(
	/** @type {Config} */ config, /** @type {Options} */ options,
	/** @type {string} */ inputFile
) {
	return await Promise.all([
		await import(path.join(
			path.dirname(inputFile),
			path.parse(inputFile).base + '.ten.js'
		)).catch((err) => {
				if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
			}),
		await import(path.join(
			path.dirname(inputFile),
			'route.ten.js'
		)).catch((err) => {
				if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
			})
	])

}

async function utilFileExists(/** @type {string} */ file) {
	return await fs
		.stat(file)
		.then(() => true)
		.catch(() => false)
}
