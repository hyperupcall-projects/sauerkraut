#!/usr/bin/env node
import path from 'node:path'
import util, { styleText } from 'node:util'
import url from 'node:url'
import readline from 'node:readline'
import fs, { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'

import { rollup } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import TOML from 'smol-toml'
import { createConsola } from 'consola'
import markdownit from 'markdown-it'
import { full as markdownEmoji } from 'markdown-it-emoji'
import Shiki from '@shikijs/markdown-it'
import watcher from '@parcel/watcher'
import * as v from 'valibot'
import * as cheerio from 'cheerio'
import { globIterate } from 'glob'
import { markdownMermaid } from './markdownIt.js'
import esbuild from 'esbuild'
import prettier from 'prettier'
import handlebars from 'handlebars'
import { convertInputUriToOutputUri, utilGetContentDirSyncWalker } from './util.js'
import { runServer } from './server.js'
import { NoteLayout } from '#layouts/Note.js'

/**
 * @import { AddressInfo } from 'node:net'
 * @import { PathBase } from 'path-scurry'
 * @import { PackageJson } from 'type-fest'
 * @import { Config, SkFile, Options, Page, Frontmatter } from './types.d.ts'
 * @typedef {Awaited<ReturnType<utilLoadConfig>>} Config
 */

export const logger = createConsola({
	level: process.env.DEBUG === undefined ? 3 : 4,
})

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
globalThis.MarkdownItInstance = MarkdownItInstance // TODO
let HandlebarsInstance = handlebars

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
	const helpText = `sauerkraut [--dir=...] <subcommand> [options]
	Subcommands:
		build [--clean] [--watch] [glob]
		serve [--bundle] [glob]
		new

	Options:
    -h, --help
    --clean
    --verbose`

	const { values, positionals } = util.parseArgs({
		allowPositionals: true,
		options: {
			dir: { type: 'string', default: '.' },
			clean: { type: 'boolean', default: false },
			watch: { type: 'boolean', default: false },
			bundle: { type: 'boolean', default: false },
			verbose: { type: 'boolean', default: false },
			help: { type: 'boolean', default: false, alias: 'h' },
		},
	})
	const /** @type {Options} */ options = {
			dir: /** @type {string} */ (values.dir),
			command: /** @type {Options['command']} */ (positionals[0]),
			clean: /** @type {boolean} */ (values.clean), // TODO: Boolean not inferred
			watch: /** @type {boolean} */ (values.watch), // TODO: Boolean not inferred
			bundle: /** @type {boolean} */ (values.bundle), // TODO: Boolean not inferred
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

	const configFile = path.join(
		path.isAbsolute(options.dir) ? options.dir : path.join(process.cwd(), options.dir),
		'sauerkraut.config.ts',
	)
	let config = await utilLoadConfig(configFile)
	globalThis.config = config
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
}

export async function commandServe(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	await runServer(config, options)
}

export async function commandBuild(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	const /** @type {string[]} */ fileQueue = []
	if (options.clean) {
		await fsClearBuildDirectory(config, options)
	}
	// await watcher.subscribe(
	// 	config.rootDir,
	// 	(err, events) => {
	// 		if (err) {
	// 			console.error(err)
	// 			return
	// 		}

	// 		for (const event of events) {
	// 			if (event.type === 'create' || event.type === 'update') {
	// 				const fileQueue = []
	// 				addAllContentFilesToFileQueue(fileQueue, config, options)
	// 				iterateFileQueueByCallback(fileQueue, config, options, {
	// 					async onEmptyFileQueue() {
	// 						// await fsCopyStaticFiles(config, options) // TODO
	// 					},
	// 				})
	// 			}
	// 		}
	// 	},
	// 	{
	// 		ignore: [config.outputDir],
	// 	},
	// )

	// process.on('SIGINT', async () => {
	// 	await fsp.mkdir('.hidden', { recursive: true })
	// 	await watcher.writeSnapshot(config.rootDir, '.hidden/.sauerkraut-snapshot.txt')
	// 	process.exit(0)
	// })

	if (options.clean) {
		await fsClearBuildDirectory(config, options)
	}
	await addAllContentFilesToFileQueue(fileQueue, config, options)
	await iterateFileQueueByWhileLoop(fileQueue, config, options)
	await fsCopyStaticFiles(config, options)

	logger.success('Done.')

	async function iterateFileQueueByWhileLoop(
		/** @type {string[]} */ fileQueue,
		/** @type {Config} */ config,
		/** @type {Options} */ options,
	) {
		while (fileQueue.length > 0) {
			const inputFile = path.join(config.contentDir, fileQueue[0])
			for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
				const outputFile = path.join(config.outputDir, page.outputUri)

				await fsp.mkdir(path.dirname(outputFile), { recursive: true })
				const result = await handleContentFile(config, options, page)
				if (result === undefined) {
				} else if (result === null) {
					await fsp.copyFile(inputFile, outputFile)
				} else {
					await fsp.writeFile(outputFile, result)
				}
			}

			fileQueue.splice(0, 1)
		}
	}
}

export async function commandNew(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
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
	const markdownFile = path.join(config.contentDir, 'posts/drafts', `${slug}/${slug}.md`)
	await fsp.mkdir(path.dirname(markdownFile), { recursive: true })
	await fsp.writeFile(
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

/** @returns {AsyncGenerator<Page>} */
export async function* yieldPagesFromInputFile(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {string} */ inputFile,
) {
	const inputUri = path.relative(config.contentDir, inputFile)
	const skFilepath = path.join(
		path.dirname(inputFile),
		path.parse(inputFile).base + '.sk.js',
	)
	let skFile = null
	if (existsSync(skFilepath)) {
		// TODO
		skFile = await import(skFilepath)
	}

	const outputUri = await convertInputUriToOutputUri(config, options, inputUri, skFile)

	/** @type {Page} */
	const page = {
		inputFile,
		inputUri,
		skFile,
		parameters: {},
		outputUri,
	}

	if (page.skFile?.GenerateSlugMapping) {
		const slugMap = (await page.skFile.GenerateSlugMapping({ config, options })) ?? []
		const originalOutputUri = page.outputUri
		for (const slug of slugMap) {
			const data =
				(await page.skFile?.GenerateTemplateVariables?.(
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
			(await page.skFile?.GenerateTemplateVariables?.({ config, options }, {})) ?? {}
		page.parameters = data

		yield page
	}
}

export async function handleContentFile(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {Page} */ page,
) {
	if (
		// prettier-ignore
		(page.inputUri.includes('/_') ||
			page.inputUri.includes('_/'),
			path.parse(page.inputUri).name.endsWith('_') ||
			page.inputUri.endsWith('.sk.js'))
	) {
		// Do not copy file.
	} else if (page.inputUri.includes('/drafts/')) {
		// Do not copy file.
	} else if (page.inputUri.endsWith('.md')) {
		let markdown = await fsp.readFile(
			path.join(config.contentDir, page.inputUri),
			'utf-8',
		)

		const { inputHtml, frontmatter } = (() => {
			let frontmatter = {}
			markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
				frontmatter = TOML.parse(toml)
				return ''
			})

			return {
				inputHtml: MarkdownItInstance.render(markdown),
				frontmatter: /** @type {Frontmatter} */ (
					config.validateFrontmatter(
						config,
						path.join(config.contentDir, page.inputUri),
						frontmatter,
					)
				),
			}
		})()

		const meta = await page.skFile?.Meta?.({ config, options })
		const head = (await page.skFile?.Head?.({ config, options })) || ''

		let outputHtml = await config.createHtml(
			config,
			head,
			{
				inputFileType: 'markdown',
				layout: frontmatter?.layout ?? '',
				body: inputHtml,
				environment: options.env,
				title: frontmatter.title ?? '',
			},
			{
				__frontmatter: frontmatter,
				__date: (() => {
					// TODO
					if (!frontmatter.date) {
						return ''
					}

					const date = new Date(frontmatter.date)
					return `${date.getFullYear()}-${date.getMonth()}-${date.getDay()}`
				})(),
			},
		)
		outputHtml = await processHtml(outputHtml)

		return outputHtml
	} else if (page.inputUri.endsWith('.html') || page.inputUri.endsWith('.xml')) {
		let inputHtml = await fsp.readFile(
			path.join(config.contentDir, page.inputUri),
			'utf-8',
		)

		if (inputHtml.includes('{{')) {
			// TODO
			inputHtml = HandlebarsInstance.compile(inputHtml, {
				noEscape: true,
				// strict: true, // TODO
				// ignoreStandalone: true,
				// explicitPartialContext: true,
			})({
				Page: page,
				Env: options.env,
			})
		}

		const meta = await page.skFile?.Meta?.({ config, options })
		const head = (await page.skFile?.Head?.({ config, options })) || ''

		let outputHtml = await config.createHtml(config, head, {
			inputFileType: 'html',
			layout: meta?.layout ?? '',
			body: inputHtml,
			environment: options.env,
			title: head?.title ?? config.title,
		})
		outputHtml = await processHtml(outputHtml)
		outputHtml = await prettier.format(outputHtml, {
			filepath: '.html',
			useTabs: true,
			tabWidth: 3,
		})

		return outputHtml
	} else if (page.inputUri.endsWith('.cards.json')) {
		let json = await fsp.readFile(path.join(config.contentDir, page.inputUri), 'utf-8')

		return await processHtml(html)
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

		let outputHtml = $.html()
		outputHtml = await prettier.format(outputHtml, {
			filepath: '.html',
			useTabs: true,
			tabWidth: 3,
		})

		return outputHtml
	}
}

async function fsCopyStaticFiles(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	try {
		await fsp.cp(config.staticDir, config.outputDir, {
			recursive: true,
		})
	} catch (err) {
		if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
	}

	try {
		await fsp.cp(path.join(import.meta.dirname, '../static'), config.outputDir, {
			recursive: true,
		})
	} catch (err) {
		if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
	}
}

async function fsClearBuildDirectory(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	logger.info('Clearing build directory...')
	try {
		await fsp.rm(config.outputDir, { recursive: true })
	} catch (err) {
		if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
	}
}

async function addAllContentFilesToFileQueue(
	/** @type {string[]} */ fileQueue,
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	if (!options.positionals[0]) {
		const walker = utilGetContentDirSyncWalker(config)
		for (const entry of walker) {
			if (!entry.isFile()) {
				continue
			}

			const inputFile = path.join(entry.parentPath, entry.name)
			const inputUri = path.relative(config.contentDir, inputFile)
			fileQueue.push(inputUri)
		}
	} else {
		for await (const inputUri of globIterate(options.positionals[0], {
			cwd: config.contentDir,
			absolute: false,
			dot: true,
			nodir: true,
		})) {
			fileQueue.push(inputUri)
		}
	}
}

export async function utilLoadConfig(/** @type {string} */ configFile) {
	const rootDir = path.dirname(configFile)
	let config = v.getDefaults(getConfigSchema(rootDir))
	try {
		config = await import(configFile)
	} catch (err) {
		throw err
	}
	globalThis.config = config // TODO
	const configSchema = getConfigSchema(rootDir)
	const result = v.safeParse(configSchema, config)
	if (result.success) {
		return result.output
	} else {
		logger.error(`Failed to parse config file: "${configFile}"`)
		console.error(v.flatten(result.issues))
		process.exit(1)
	}

	function getConfigSchema(/** @type {string} */ rootDir) {
		return v.strictObject({
			title: v.optional(v.string(), 'Website'),
			rootDir: v.optional(v.string(), rootDir),
			contentDir: v.optional(v.string(), path.join(rootDir, 'content')),
			staticDir: v.optional(v.string(), path.join(rootDir, 'static')),
			outputDir: v.optional(v.string(), path.join(rootDir, 'build')),
			transformUri: v.optional(
				v.pipe(
					v.function(),
					v.transform((func) => {
						/** @type {Config['transformUri']} */
						return (config, uri) => {
							return v.parse(v.string(), func(config, uri))
						}
					}),
				),
				() =>
					/** @type {Config['transformUri']} */
					function defaultTransformUri(_config, uri) {
						return uri
					},
			),
			validateFrontmatter: v.optional(
				v.pipe(
					v.function(),
					v.transform((func) => {
						/** @type {Config['validateFrontmatter']} */
						return (config, inputFile, frontmatter) => {
							return v.parse(
								v.record(v.string(), v.any()),
								func(config, inputFile, frontmatter),
							)
						}
					}),
				),
				() =>
					/** @type {Config['validateFrontmatter']} */
					function defaultValidateFrontmatter(_config, _inputFile, frontmatter) {
						return frontmatter
					},
			),
			createHtml: v.optional(
				v.pipe(
					v.function(),
					v.transform((func) => {
						/** @type {Config['createHtml']} */
						return async (config, head, layoutData) => {
							return v.parse(v.string(), await func(config, head, layoutData))
						}
					}),
				),
				() =>
					/** @type {Config['createHtml']} */
					async function defaultCreateHtml(config, head, layoutData) {
						return await NoteLayout(config, head, layoutData)
					},
			),
			createHead: v.optional(
				v.pipe(
					v.function(),
					v.transform((func) => {
						/** @type {Config['createHead']} */
						return async (config, layoutData) => {
							return v.parse(v.string(), await func(config, layoutData))
						}
					}),
				),
				() =>
					/** @type {Config['createHead']} */
					async function defaultCreateHead(config, layoutData) {
						return ''
					},
			),
			createContent: v.optional(
				v.pipe(
					v.function(),
					v.transform((func) => {
						/** @type {Config['createContent']} */
						return async (config, layoutData) => {
							return v.parse(v.string(), await func(config, layoutData))
						}
					}),
				),
				() =>
					/** @type {Config['createContent']} */
					async function defaultCreateContent(config, layoutData) {
						return `<main id="content">${layoutData.body}</main>`
					},
			),
		})
	}
}
