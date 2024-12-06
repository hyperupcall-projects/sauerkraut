#!/usr/bin/env node
// @ts-check
import fs from 'node:fs/promises'
import fsCb from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import url from 'node:url'
import module from 'node:module'
import readline from 'node:readline'

import TOML from 'smol-toml'
import handlebarsImport from 'handlebars'
import { createConsola } from 'consola'
import markdownit from 'markdown-it'
import { full as markdownEmoji } from 'markdown-it-emoji'
import Shiki from '@shikijs/markdown-it'
import { listen } from 'listhen'
import {
	createApp,
	createRouter,
	defineEventHandler,
	serveStatic,
	setResponseHeaders,
	toNodeListener,
} from 'h3'
import watcher from '@parcel/watcher'
import mime from 'mime-types'
import ansiEscapes from 'ansi-escapes'
import * as v from 'valibot'
import chalk from 'chalk'
import * as cheerio from 'cheerio'
import { globIterate } from 'glob'
import { PathScurry } from 'path-scurry'
import { markdownMermaid } from './markdownIt.js'
import debounce from 'debounce'
import { layouts } from './config.js'

/**
 * @typedef {import('handlebars')} Handlebars
 * @import { H3Event, EventHandlerRequest } from 'h3'
 * @import { PackageJson } from 'type-fest'
 * @import { TenFile, Options, Page, Frontmatter } from './types.d.ts'
 * @typedef {v.InferOutput<ReturnType<typeof getConfigSchema>>} Config
 */

module.register(url.pathToFileURL(path.join(import.meta.dirname, './hot.js')))

export const logger = createConsola({
	level: process.env.DEBUG === undefined ? 3 : 4,
})

logger.debug('Finished evaluating imports...')

function getConfigSchema(/** @type {string} */ rootDir) {
	return v.object({
		defaults: v.strictObject({
			title: v.string(),
			rootDir: v.optional(v.string(), rootDir),
			contentDir: v.optional(v.string(), path.join(rootDir, 'content')),
			layoutDir: v.optional(v.string(), path.join(rootDir, 'layouts')),
			partialDir: v.optional(v.string(), path.join(rootDir, 'partials')),
			staticDir: v.optional(v.string(), path.join(rootDir, 'static')),
			outputDir: v.optional(v.string(), path.join(rootDir, 'build')),
		}),
		transformUri: v.optional(
			v.pipe(
				v.function(),
				v.transform((func) => {
					return (/** @type {string} */ uri) => v.parse(v.string(), func(uri))
				}),
			),
		),
		decideLayout: v.optional(
			v.pipe(
				v.function(),
				v.transform((func) => {
					return async (
						/** @type {Config} */ config,
						/** @type {Options} */ options,
						/** @type {Page} */ page,
					) =>
						v.parse(
							v.union([v.undefined(), v.string()]),
							await func(config, options, page),
						)
				}),
			),
			() => () => '__default.hbs',
		),
		validateFrontmatter: v.optional(
			v.pipe(
				v.function(),
				v.transform((func) => {
					return (
						/** @type {Config} */ config,
						/** @type {string} */ inputFile,
						/** @type {Frontmatter} */ frontmatter,
					) =>
						v.parse(v.record(v.string(), v.any()), func(config, inputFile, frontmatter))
				}),
			),
			() => () => true,
		),
		handlebarsHelpers: v.optional(v.record(v.string(), v.function())),
		tenHelpers: v.optional(v.record(v.string(), v.function())),
	})
}

const ShikiInstance = await Shiki({
	langs: [
		'javascript',
		'typescript',
		'cpp',
		'markdown',
		'html',
		'css',
		'json',
		'yaml',
		'sh',
		'properties',
		'makefile',
		'tcl',
		'python',
	],
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
	md.use(markdownMermaid)
	return md
})()
let /** @type {Handlebars} */ HandlebarsInstance = /** @type {any} */ (null)
globalThis.MarkdownItInstance = MarkdownItInstance // TODO

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
	logger.debug('Starting main() function...')
	const helpText = `ten [--dir|-D=...] <subcommand> [options]
	Subcommands:
		build [--clean] [--watch] [glob]
		serve [glob]
		new

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
			watch: { type: 'boolean', default: false },
			help: { type: 'boolean', default: false, alias: 'h' },
		},
	})
	const /** @type {Options} */ options = {
			dir: /** @type {string} */ (values.dir),
			command: /** @type {Options['command']} */ (positionals[0]),
			clean: /** @type {boolean} */ (values.clean), // TODO: Boolean not inferred
			watch: /** @type {boolean} */ (values.watch), // TODO: Boolean not inferred
			verbose: /** @type {boolean} */ (values.verbose),
			positionals: positionals.slice(1) ?? [],
			env: '',
		}

	if (!options.command) {
		console.error(helpText)
		logger.error('No command provided.')
		process.exit(1)
	}

	if (values.help) {
		logger.info(helpText)
		process.exit(0)
	}

	if (
		options.command !== 'serve' &&
		options.command !== 'build' &&
		options.command !== 'new'
	) {
		console.error(helpText)
		if (!positionals[0]) {
			logger.error(`No command passed`)
		} else {
			logger.error(`Unknown command: ${positionals[0]}`)
		}
		process.exit(1)
	}

	const configFile = path.join(process.cwd(), options.dir, 'ten.config.js')
	let config = await loadConfig(configFile)
	if (options.command === 'serve') {
		options.env = 'development'
		await commandServe(config, options)
	} else if (options.command === 'build') {
		if (options.watch) {
			options.env = 'development'
		}
		await commandBuild(config, options)
	} else if (options.command === 'new') {
		await commandNew(config, options)
	}

	/** @returns {Promise<Config>} */
	async function loadConfig(/** @type {string} */ configFile) {
		if (!(await utilFileExists(configFile))) {
			logger.error(
				`File "ten.config.js" not found for project: "${path.dirname(configFile)}"`,
			)
			process.exit(1)
		}

		const /** @type {Config} */ config = await import(configFile)
		const rootDir = path.dirname(configFile)
		const configSchema = getConfigSchema(rootDir)
		const result = v.safeParse(configSchema, config)
		if (result.success) {
			return result.output
		} else {
			logger.error(`Failed to parse config file: "${configFile}"`)
			console.error(v.flatten(result.issues))
			process.exit(1)
		}
	}
}

async function commandServe(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	const /** @type {Map<string, string>} */ contentMap = new Map()

	await fsRegisterHandlebarsHelpers(config, options)
	await fsPopulateContentMap(contentMap, config, options)

	const app = createApp()
	const router = createRouter()
	app.use(router)

	router.get(
		'/**',
		defineEventHandler(async (event) => {
			try {
				const outputUri = event.path.endsWith('/')
					? `${event.path}index.html`
					: event.path

				const inputUri = contentMap.get(outputUri)

				setResponseHeaders(event, {
					'Content-Type': mime.lookup(outputUri) || 'text/html',
					'Transfer-Encoding': 'chunked',
					'Cache-Control': 'no-cache',
					Expires: '0',
				})

				if (inputUri) {
					const inputFile = path.join(config.defaults.contentDir, inputUri)
					console.info(
						`${chalk.magenta('Content Request')}: ${event.path}\t\t\t${chalk.gray(`(from ${event.path})`)}`,
					)

					for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
						const result = await handleContentFile(config, options, page)
						if (typeof result === 'string') {
							return result
						} else {
							return utilServeStatic(event, path.dirname(page.inputFile))
						}
					}
				} else {
					console.info(`${chalk.cyan('Static Request')}:  ${event.path}`)
					const staticDir = event.path.startsWith('/__/')
						? path.join(import.meta.dirname, '../resources/static')
						: config.defaults.staticDir

					return utilServeStatic(event, staticDir)
				}
			} catch (err) {
				console.error(err)
			}
		}),
	)

	const listener = await listen(toNodeListener(app), {
		port: process.env.PORT ?? 3001,
		showURL: false,
	})
	logger.start(`Listening at http://localhost:${listener.address.port}`)

	utilOnConfigFileChange(options, () => {
		listener.close().then(() => {
			logger.info('Restarting server...')
			main()
		})
	})
	process.on('SIGINT', async () => {
		await listener.close()
		process.exit(0)
	})
}

// TODO
export async function commandWatch(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	if (options.clean) {
		await fsClearBuildDirectory(config, options)
	}
	await fsRegisterHandlebarsHelpers(config, options)
	await watcher.subscribe(
		config.defaults.rootDir,
		(err, events) => {
			if (err) {
				console.error(err)
				return
			}

			for (const event of events) {
				if (event.type === 'create' || event.type === 'update') {
					const fileQueue = []
					addAllContentFilesToFileQueue(fileQueue, config, options)
					iterateFileQueueByCallback(fileQueue, config, options, {
						async onEmptyFileQueue() {
							// await fsCopyStaticFiles(config, options) // TODO
						},
					})
				}
			}
		},
		{
			ignore: [config.defaults.outputDir],
		},
	)

	process.on('SIGINT', async () => {
		await fs.mkdir('.hidden', { recursive: true })
		await watcher.writeSnapshot(config.defaults.rootDir, '.hidden/.ten-snapshot.txt')
		process.exit(0)
	})
}

export async function commandBuild(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	const /** @type {string[]} */ fileQueue = []

	if (options.clean) {
		await fsClearBuildDirectory(config, options)
	}
	await fsRegisterHandlebarsHelpers(config, options)
	await addAllContentFilesToFileQueue(fileQueue, config, options)
	await iterateFileQueueByWhileLoop(fileQueue, config, options)
	await fsCopyStaticFiles(config, options)
	logger.success('Done.')
}

async function commandNew(/** @type {Config} */ config, /** @type {Options} */ options) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	rl.on('SIGINT', () => {
		logger.error('Aborting...')
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
		`${slug}/${slug}.md`,
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

`,
	)
	rl.close()
	logger.info(`File created at ${markdownFile}`)
}

async function iterateFileQueueByCallback(
	/** @type {string[]} */ fileQueue,
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	{ onEmptyFileQueue = /** @type {() => void | Promise<void>} */ () => {} } = {},
) {
	let lastCallbackWasEmpty = false
	await cb()

	async function cb() {
		if (fileQueue.length > 0) {
			const inputFile = path.join(config.defaults.contentDir, fileQueue[0])
			for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
				const outputUrl = path.join(config.defaults.outputDir, page.outputUri)

				await fs.mkdir(path.dirname(outputUrl), { recursive: true })
				const result = await handleContentFile(config, options, page)
				if (result === undefined) {
				} else if (result === null) {
					await fs.copyFile(inputFile, outputUrl)
				} else {
					await fs.writeFile(outputUrl, result)
				}
			}

			fileQueue.splice(0, 1)
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

async function iterateFileQueueByWhileLoop(
	/** @type {string[]} */ fileQueue,
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	while (fileQueue.length > 0) {
		const inputFile = path.join(config.defaults.contentDir, fileQueue[0])
		for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
			const outputFile = path.join(config.defaults.outputDir, page.outputUri)

			await fs.mkdir(path.dirname(outputFile), { recursive: true })
			const result = await handleContentFile(config, options, page)
			if (result === undefined) {
			} else if (result === null) {
				await fs.copyFile(inputFile, outputFile)
			} else {
				await fs.writeFile(outputFile, result)
			}
		}

		fileQueue.splice(0, 1)
	}
}

/** @returns {AsyncGenerator<Page>} */
async function* yieldPagesFromInputFile(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {string} */ inputFile,
) {
	const inputUri = path.relative(config.defaults.contentDir, inputFile)
	const tenFilepath = path.join(
		path.dirname(inputFile),
		path.parse(inputFile).base + '.ten.js',
	)
	const tenFile = await import(tenFilepath).catch((err) => {
		if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
	})
	const outputUri = await convertInputUriToOutputUri(config, options, inputUri, tenFile)

	/** @type {Page} */
	const page = {
		inputFile,
		inputUri,
		tenFile,
		parameters: {},
		outputUri,
	}

	if (page.tenFile?.GenerateSlugMapping) {
		const slugMap = (await page.tenFile.GenerateSlugMapping({ config, options })) ?? []
		const originalOutputUri = page.outputUri
		for (const slug of slugMap) {
			const data =
				(await page.tenFile?.GenerateTemplateVariables?.(
					{ config, options },
					{
						slug: slug.slug,
						count: slug.count,
					},
				)) ?? {}

			page.outputUri = path.join(path.dirname(originalOutputUri), slug.slug, 'index.html')
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
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {Page} */ page,
) {
	if (page.inputUri.startsWith('/__/')) {
		return null // TODO
	}

	// TODO
	/** @type {NonNullable<Parameters<typeof HandlebarsInstance.compile>[1]>} */
	const defaultHandlebarsCompileOptions = {
		noEscape: true,
		// strict: true, // TODO
		// ignoreStandalone: true,
		// explicitPartialContext: true,
	}
	// TODO
	let titleOverride
	HandlebarsInstance.registerHelper(
		'setVariable',
		function setVariable(varName, varValue, options) {
			options.data.root[varName] = varValue
			if (varName === '__title') {
				titleOverride = varValue
			}
		},
	)

	if (
		// prettier-ignore
		(page.inputUri.includes('/_') ||
		page.inputUri.includes('_/'),
		path.parse(page.inputUri).name.endsWith('_') ||
		page.inputUri.endsWith('.ten.js'))
	) {
		// Do not copy file.
	} else if (page.inputUri.includes('/drafts/')) {
		// Do not copy file.
	} else if (page.inputUri.endsWith('.md')) {
		let markdown = await fs.readFile(
			path.join(config.defaults.contentDir, page.inputUri),
			'utf-8',
		)
		const { html, frontmatter } = (() => {
			let frontmatter = {}
			markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
				frontmatter = TOML.parse(toml)
				return ''
			})

			return {
				html: MarkdownItInstance.render(markdown),
				frontmatter: /** @type {Frontmatter} */ (
					config.validateFrontmatter(
						config,
						path.join(config.defaults.contentDir, page.inputUri),
						frontmatter,
					)
				),
			}
		})()

		const layoutInput = await utilExtractLayout(config, [
			frontmatter?.layout,
			await config?.decideLayout?.(config, options, page),
			'__default.hbs',
		])
		const layoutOutput = HandlebarsInstance.compile(layoutInput, {
			...defaultHandlebarsCompileOptions,
		})({
			Page: page,
			Title: titleOverride ?? frontmatter.title,
			Env: options.env,
			Body: html,
			__frontmatter: frontmatter,
			__date: (() => {
				// TODO
				if (!frontmatter.date) {
					return ''
				}

				const date = new Date(frontmatter.date)
				return `${date.getFullYear()}-${date.getMonth()}-${date.getDay()}`
			})(),
		})

		return await processHtml(layoutOutput)
	} else if (page.inputUri.endsWith('.html') || page.inputUri.endsWith('.xml')) {
		const meta = await page.tenFile?.Meta?.({ config, options })
		const head = await page.tenFile?.Head?.({ config, options })
		const title = head?.title ?? config.defaults?.title ?? ''

		let pageInput = await fs.readFile(
			path.join(config.defaults.contentDir, page.inputUri),
			'utf-8',
		)
		const pageOutput = HandlebarsInstance.compile(pageInput, {
			...defaultHandlebarsCompileOptions,
		})({
			Page: page,
			Title: title,
			Env: options.env,
		})

		const layoutInput = await utilExtractLayout(config, [
			meta?.layout,
			await config?.decideLayout?.(config, options, page),
			'__default.hbs',
		])
		const layoutOutput = HandlebarsInstance.compile(layoutInput, {
			...defaultHandlebarsCompileOptions,
		})({
			Page: page,
			Title: title,
			Env: options.env,
			Body: pageOutput,
			__header_content: head?.content ?? '',
		})

		return await processHtml(layoutOutput)
	} else if (page.inputUri.endsWith('.cards.json')) {
		let json = await fs.readFile(
			path.join(config.defaults.contentDir, page.inputUri),
			'utf-8',
		)
		let title = `${JSON.parse(json).author}'s flashcards`

		const input = await fs.readFile(
			path.join(import.meta.dirname, '../resources/apps/flashcards/flashcards.hbs'),
			'utf-8',
		)
		const output = HandlebarsInstance.compile(input, {
			...defaultHandlebarsCompileOptions,
		})({
			Page: page,
			Title: title,
			Env: options.env,
			__flashcard_data: json,
		})

		return await processHtml(output)
	} else {
		return null
	}

	async function processHtml(/** @type {string} */ html) {
		const $ = cheerio.load(html)
		// Set default "target" attribute for all "a" links.
		{
			$('a').each((_, el) => {
				if (/^(?:[a-z+]+:)?\/\//u.test(el.attribs.href)) {
					$(el).attr('target', '_blank')
				} else {
					$(el).attr('target', '_self')
				}
			})
		}

		{
			// TODO
			// const possibleLocations = await Promise.all([
			// 	path.join(options.dir, href)
			// ])
			// const $links = $('*[href]')
			// $links.each((_, el_) => {
			// 	const el = $(el_) // TODO
			// 	const href = el.attr('href') ?? ''
			// 	if (href.includes('node_modules')) {
			// 		if (!href.startsWith('/node_modules')) {
			// 			throw new Error(`Any node_modules link must start with "/node_modules"`)
			// 		}
			// 		const parts = href.split('/')
			// 		const packageName = parts[parts.indexOf('node_modules') + 1]
			// 		const packageJsonPath = path.join(
			// 			process.cwd(),
			// 			parts.splice(0, parts.indexOf(packageName) + 1).join('/'),
			// 			'package.json',
			// 		)
			// 		const text = fsSync.readFileSync(packageJsonPath, 'utf-8')
			// 		const /** @type {PackageJson} */ packageJson = JSON.parse(text)
			// 		const version = packageJson.dependencies?.[packageName]
			// 		const newHref = href.replace('node_modules', `${packageName}@${version}`)
			// 		el.attr('href', newHref)
			// 		console.log(newHref)
			// 	}
			// })
		}

		return $.html()
	}
}

async function fsCopyStaticFiles(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	try {
		await fs.cp(config.defaults.staticDir, config.defaults.outputDir, {
			recursive: true,
		})
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}

	try {
		await fs.cp(
			path.join(import.meta.dirname, '../resources/static'),
			config.defaults.outputDir,
			{
				recursive: true,
			},
		)
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsClearBuildDirectory(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	logger.info('Clearing build directory...')
	try {
		await fs.rm(config.defaults.outputDir, { recursive: true })
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsPopulateContentMap(
	/** @type {Map<string, string>} */ contentMap,
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	const pw = new PathScurry(config.defaults.contentDir)
	for await (const entry of pw) {
		if (!entry.isFile()) {
			continue
		}

		const inputFile = path.join(entry.parentPath, entry.name)
		for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
			console.info(
				`${chalk.gray(`Adding ${ansiEscapes.link(page.outputUri, inputFile)}`)}`,
			)
			contentMap.set(page.outputUri, page.inputUri)
		}
	}
}

const OriginalHandlebarsHelpers = Object.keys(handlebarsImport.helpers)

async function fsRegisterHandlebarsHelpers(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	const handlebars = handlebarsImport.create()

	// Re-register partials.
	for (const partial in handlebars.partials) {
		handlebars.unregisterPartial(partial)
	}
	for (const dirent of [
		...(await fs.readdir(path.join(import.meta.dirname, '../resources/partials'), {
			withFileTypes: true,
		})),
		...(await fs
			.readdir(config.defaults.partialDir, { withFileTypes: true })
			.catch((err) => {
				if (err.code === 'ENOENT') {
					return []
				} else {
					throw err
				}
			})),
	]) {
		const partialContent = await fs.readFile(
			path.join(dirent.parentPath, dirent.name),
			'utf-8',
		)

		handlebars.registerPartial(path.parse(dirent.name).name, partialContent)
	}

	// Re-register helpers.
	for (const helper in config.handlebarsHelpers) {
		if (OriginalHandlebarsHelpers.includes(helper)) continue

		handlebars.unregisterHelper(helper)
	}
	for (const helper in config.handlebarsHelpers) {
		handlebars.registerHelper(helper, config.handlebarsHelpers[helper])
	}
	handlebars.registerHelper(
		'eq',
		(/** @type {unknown} */ left, /** @type {unknown} */ right) => {
			return left === right
		},
	)

	HandlebarsInstance = handlebars
}

async function addAllContentFilesToFileQueue(
	/** @type {string[]} */ fileQueue,
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	if (!options.positionals[0]) {
		const pw = new PathScurry(config.defaults.contentDir)
		for await (const entry of pw) {
			if (!entry.isFile()) {
				continue
			}

			const inputFile = path.join(entry.parentPath, entry.name)
			const inputUri = path.relative(config.defaults.contentDir, inputFile)
			fileQueue.push(inputUri)
		}
	} else {
		for await (const inputUri of globIterate(options.positionals[0], {
			cwd: config.defaults.contentDir,
			absolute: false,
			dot: true,
			nodir: true,
		})) {
			fileQueue.push(inputUri)
		}
	}
}

async function convertInputUriToOutputUri(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {string} */ inputUri,
	/** @type {TenFile} */ tenFile,
) {
	if (config?.transformUri) {
		inputUri = config.transformUri(inputUri)
	}
	inputUri = '/' + inputUri // TODO
	if (inputUri.endsWith('.cards.json')) {
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

		return path.basename(path.dirname(inputUri))
	}
}

async function utilExtractLayout(
	/** @type {Config} */ config,
	/** @type {(Buffer | string | undefined)[]} */ layouts,
) {
	for (const layout of layouts) {
		if (layout === undefined || layout === null) {
			continue
		}

		if (layout instanceof Buffer) {
			return layout.toString()
		} else if (typeof layout === 'string') {
			const file1 = path.join(import.meta.dirname, '../resources/layouts', layout)
			if (await utilFileExists(file1)) {
				return await fs.readFile(file1, 'utf-8')
			}

			const file2 = path.join(config.defaults.layoutDir, layout)
			if (await utilFileExists(file2)) {
				return await fs.readFile(file2, 'utf-8')
			}

			throw new Error(`Failed to find layout "${layout}"`)
		}
	}
}

async function utilFileExists(/** @type {string} */ file) {
	return await fs
		.stat(file)
		.then(() => true)
		.catch(() => false)
}

async function utilOnConfigFileChange(
	/** @type {Options} */ options,
	/** @type {() => void | Promise<void>} */ cb,
) {
	const configFile = path.join(process.cwd(), options.dir, 'ten.config.js')
	fsCb.watch(
		configFile,
		{},
		debounce(async (eventType) => {
			if (eventType === 'change') {
				await cb()
			}
		}, 100),
	)
}

function utilServeStatic(
	/** @type {H3Event<EventHandlerRequest>} */ event,
	/** @type {string} */ staticDir,
) {
	return serveStatic(event, {
		getContents(uri) {
			return fs.readFile(path.join(staticDir, uri))
		},
		async getMeta(uri) {
			const stats = await fs.stat(path.join(staticDir, uri)).catch(() => null)

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
