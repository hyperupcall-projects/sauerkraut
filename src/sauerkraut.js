#!/usr/bin/env node
// @ts-check
import path from 'node:path'
import util, { styleText } from 'node:util'
import url from 'node:url'
import readline from 'node:readline'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'

import { rollup } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import TOML from 'smol-toml'
import { createConsola } from 'consola'
import markdownit from 'markdown-it'
import { full as markdownEmoji } from 'markdown-it-emoji'
import Shiki from '@shikijs/markdown-it'
import watcher from '@parcel/watcher'
import mime from 'mime-types'
import ansiEscapes from 'ansi-escapes'
import * as v from 'valibot'
import * as cheerio from 'cheerio'
import { globIterate } from 'glob'
import { PathScurry } from 'path-scurry'
import { markdownMermaid } from './markdownIt.js'
import debounce from 'debounce'
import esbuild from 'esbuild'
import dedent from 'dedent'
import prettier from 'prettier'
import express from 'express'
import bodyParser from 'body-parser'
import { Html } from './template.js'

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
	const helpText = `sauerkraut [--dir|-D=...] <subcommand> [options]
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
			dir: { type: 'string', default: '.' },
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

	const configFile = path.join(process.cwd(), options.dir, 'sauerkraut.config.js')
	let config = await utilLoadConfig(configFile)
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
	const /** @type {Map<string, string>} */ contentMap = new Map()
	await fsPopulateContentMap(contentMap, config, options)

	const app = express()
	app.use(bodyParser.json())
	app.use('/static', express.static(config.staticDir))
	app.use(
		'/static',
		express.static(path.join(import.meta.dirname, '../resources/static')),
	)
	app.use(async (req, res, next) => {
		try {
			const outputUri = req.url.endsWith('/') ? `${req.url}index.html` : req.url
			const inputUri = contentMap.get(outputUri)
			if (!inputUri) {
				next()
				return
			}

			const inputFile = path.join(config.contentDir, inputUri)
			console.info(
				`${styleText('magenta', 'Content Request')}: ${req.url}\t\t\t${styleText('gray', `(from ${req.url})`)}`,
			)

			res.setHeaders(
				new Headers({
					'Content-Type': mime.lookup(outputUri) || 'text/html',
					'Transfer-Encoding': 'chunked',
					'Cache-Control': 'no-cache',
					Expires: '0',
				}),
			)
			for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
				const result = await handleContentFile(config, options, page)
				if (typeof result === 'string') {
					res.send(result)
				} else {
					res.sendFile(path.dirname(page.inputFile))
				}
			}
		} catch (err) {
			console.error(err)
		}
	})
	app.post('/api/get-content-tree', (req, res) => {
		const json = {}
		const walker = utilGetContentDirSyncWalker(config)
		for (let entry of walker) {
			const parents = []
			let /** @type {PathBase | undefined} */ p = entry
			while (p && p.fullpath() !== path.resolve(config.contentDir)) {
				parents.push(p)
				p = p.parent
			}

			let node = json
			for (let i = parents.length - 1; i >= 0; --i) {
				const part = parents[i]

				if (!(part.name in node)) {
					if (part.isDirectory()) {
						node[part.name] = {}
					} else {
						node[part.name] = null
					}
				}
				node = node[part.name]
			}
		}

		res.send(JSON.stringify(json, null, '\t'))
	})
	app.post('/api/get-content-list', async (req, res) => {
		const json = []
		const walker = utilGetContentDirSyncWalker(config)
		for (let entry of walker) {
			if (entry.isDirectory()) {
				continue
			}

			const filepath = path.relative(config.contentDir, entry.fullpath())
			if (filepath !== '') {
				// TODO tenConfig
				json.push(await convertInputUriToOutputUri(config, options, filepath, {}))
			}
		}

		json.sort()
		res.send(json)
	})
	app.post('/api/read-content-file', (req, res) => {
		const { uri } = req.body

		try {
			const filepath = path.join(config.contentDir, contentMap.get(uri))
			res.sendFile(filepath)
		} catch (err) {
			console.error(err)
			res.send('undefined')
		}
	})
	app.post('/api/write-content-file', async (req, res) => {
		const { uri, content } = req.body

		const filepath = path.join(config.contentDir, contentMap.get(uri))
		try {
			if (content === null || content === undefined) {
				throw new TypeError('Invalid "content"')
			}
			await fsp.writeFile(filepath, content)
			res.send({
				success: true,
			})
		} catch (err) {
			console.error(err)
			res.send({ success: false })
		}
	})

	const server = http.createServer(app)
	server.listen(
		{
			host: 'localhost',
			port: 3005,
		},
		() => {
			const info = /** @type {AddressInfo} */ (server.address())
			logger.info(`Listening at http://localhost:${info.port}`)
		},
	)
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

	let bundle
	try {
		bundle = await rollup({
			input: {
				katex: 'katex',
				'katex-auto-render': 'katex/contrib/auto-render',
				'katex-mhchem': 'katex/contrib/mhchem',
				'katex-copy-tex': 'katex/contrib/copy-tex',
				'katex-mathtex-script-type': 'katex/contrib/mathtex-script-type',
				'katex-render-a11y-string': 'katex/contrib/render-a11y-string',
				notie: 'notie',
				// mermaid: 'mermaid/dist/mermaid.esm.mjs',
				jheat: 'jheat.js',
			},
			plugins: [nodeResolve()],
		})
		await bundle.write({
			dir: './resources/bundled',
			format: 'es',
		})
	} catch (error) {
		console.error(error)
		process.exit(1)
	}
	if (bundle) {
		await bundle.close()
	}

	for (const [outputFilename, identifier] of Object.entries({
		'pico.css': '@picocss/pico',
		'github-markdown-css.css': 'github-markdown-css',
		'pure.css': 'purecss/build/pure.css',
		'bulma.css': 'bulma',
		'katex.css': 'katex/dist/katex.css',
		'fox-css.css': 'fox-css/dist/fox-min.css',
	})) {
		const file = url.fileURLToPath(import.meta.resolve(identifier))
		await fsp.writeFile(
			`./resources/bundled/${outputFilename}`,
			await fsp.readFile(file, 'utf-8'),
		)
	}

	logger.success('Done.')
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
			const inputFile = path.join(config.contentDir, fileQueue[0])
			for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
				const outputUrl = path.join(config.outputDir, page.outputUri)

				await fsp.mkdir(path.dirname(outputUrl), { recursive: true })
				const result = await handleContentFile(config, options, page)
				if (result === undefined) {
				} else if (result === null) {
					await fsp.copyFile(inputFile, outputUrl)
				} else {
					await fsp.writeFile(outputUrl, result)
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

/** @returns {AsyncGenerator<Page>} */
async function* yieldPagesFromInputFile(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {string} */ inputFile,
) {
	const inputUri = path.relative(config.contentDir, inputFile)
	const skFilepath = path.join(
		path.dirname(inputFile),
		path.parse(inputFile).base + '.sk.js',
	)
	const skFile = await import(skFilepath).catch((err) => {
		if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
	})
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

async function handleContentFile(
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

		let outputHtml = await config.createHtml(
			config,
			{
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
		const inputHtml = await fsp.readFile(
			path.join(config.contentDir, page.inputUri),
			'utf-8',
		)

		const meta = await page.skFile?.Meta?.({ config, options })
		const head = await page.skFile?.Head?.({ config, options })

		let outputHtml = await config.createHtml(config, {
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
		let title = `${JSON.parse(json).author}'s flashcards`

		const result = await esbuild.build({
			entryPoints: [path.join(import.meta.dirname, '../resources/apps/flashcards.jsx')],
			outfile: path.join(config.outputDir, page.outputUri),
			bundle: true,
			jsx: 'transform',
			jsxFactory: 'h',
			jsxFragment: 'Fragment',
			jsxImportSource: 'nano-jsx/esm',
			sourcemap: 'external',
			write: false,
		})
		for (let out of result.outputFiles) {
			// console.log(out.path, out.contents, out.hash, out.text)
		}
		const html = `
		<!DOCTYPE html>
		<html lang="en">
		<body><div id="root"></div></body>
		<script>${result.outputFiles[1].text}</script>
		</html>`
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
		if (err.code !== 'ENOENT') throw err
	}

	try {
		await fsp.cp(
			path.join(import.meta.dirname, '../resources/static'),
			config.outputDir,
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
		await fsp.rm(config.outputDir, { recursive: true })
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsPopulateContentMap(
	/** @type {Map<string, string>} */ contentMap,
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	const walker = utilGetContentDirSyncWalker(config)
	for (const stat of walker) {
		if (!stat.isFile()) {
			continue
		}

		const inputFile = path.join(stat.parentPath, stat.name)
		for await (const page of yieldPagesFromInputFile(config, options, inputFile)) {
			console.info(
				`${styleText('gray', `Adding ${ansiEscapes.link(page.outputUri, inputFile)}`)}`,
			)
			contentMap.set(page.outputUri, page.inputUri)
		}
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

async function convertInputUriToOutputUri(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {string} */ inputUri,
	/** @type {SkFile} */ tenFile,
) {
	inputUri = config.transformUri(config, inputUri)
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

export async function utilLoadConfig(/** @type {string} */ configFile) {
	const rootDir = path.dirname(configFile)
	let config = v.getDefaults(getConfigSchema(rootDir))
	try {
		config = await import(configFile)
	} catch (err) {
		if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
	}
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
						return (config, obj) => {
							return v.parse(v.string(), func(config, obj))
						}
					}),
				),
				() =>
					/** @type {Config['createHtml']} */
					function defaultCreateHtml(_config, obj) {
						return Html(obj)
					},
			),
			tenHelpers: v.optional(
				v.record(
					v.string(),
					v.pipe(
						v.function(),
						v.transform((func) => {
							return () => {
								return v.parse(v.string(), func())
							}
						}),
					),
				),
				() => {
					return {}
				},
			),
		})
	}
}

function utilGetContentDirSyncWalker(/** @type {Config} */ config) {
	return new PathScurry(config.contentDir).iterateSync({
		filter(entry) {
			return !utilShouldIgnoreName(entry.name, entry.isDirectory())
		},
		walkFilter(entry) {
			// return "false" if should skip walking directory
			return !utilShouldIgnoreName(entry.name, entry.isDirectory())
		},
	})
}

function utilShouldIgnoreName(
	/** @type {string} */ uri,
	/** @type {boolean} */ isDirectory,
) {
	if (isDirectory) {
		if (['.git', '.obsidian'].includes(uri)) {
			return true
		}

		if (uri.startsWith('_') || uri.endsWith('_')) {
			return true
		}
	}

	return false
}
