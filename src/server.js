import path from 'node:path'
import util, { styleText } from 'node:util'
import url from 'node:url'
import readline from 'node:readline'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'

import express from 'express'
import bodyParser from 'body-parser'
import mime from 'mime-types'
import ansiEscapes from 'ansi-escapes'

import { utilGetContentDirSyncWalker, utilMaybeAppendIndexHtml } from './util.js'
import { handleContentFile, logger, yieldPagesFromInputFile } from './sauerkraut.js'
import {
	getContentList,
	getContentTree,
	readContentFile,
	writeContentFile,
} from './api.js'

/**
 * @import { Config, SkFile, Options, Page, Frontmatter } from './types.d.ts'
 * @import { AddressInfo } from 'node:net'
 * @import { PathBase } from 'path-scurry'
 * @import { PackageJson } from 'type-fest'
 */

export async function runServer(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	const /** @type {Map<string, string>} */ contentMap = new Map()
	await fsPopulateContentMap(contentMap, config, options)

	const app = express()
	app.use(bodyParser.json())
	app.use('/static', express.static(config.staticDir))
	for (const dirname of ['components', 'layouts', 'static', 'utilities']) {
		app.use(
			`/${dirname}`,
			express.static(path.join(import.meta.dirname, `../${dirname}`)),
		)
	}
	app.use(async (req, res, next) => {
		try {
			const outputUri = utilMaybeAppendIndexHtml(req.url)
			const inputUri = contentMap.get(outputUri)
			if (!inputUri) {
				next()
				return
			}

			const inputFile = path.join(config.contentDir, inputUri)
			console.info(
				`${styleText('magenta', 'Content Request')}: ${req.url}\t\t\t${styleText(
					'gray',
					`(from ${req.url})`,
				)}`,
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
			next()
		}
	})
	app.post('/api/get-content-tree', async (req, res) => {
		try {
			const tree = await getContentTree(config)
			res.send(JSON.stringify(tree, null, '\t'))
		} catch (err) {
			console.error(err)
			res.send(err)
		}
	})
	app.post('/api/get-content-list', async (req, res) => {
		try {
			const tree = await getContentList(config)
			res.send(JSON.stringify(tree, null, '\t'))
		} catch (err) {
			console.error(err)
			res.send(err)
		}
	})
	app.post('/api/read-content-file', async (req, res) => {
		const { uri } = req.body

		try {
			const result = await readContentFile(config, uri)
			res.send(result)
		} catch (err) {
			console.error(err)
			res.send(err)
		}
	})
	app.post('/api/write-content-file', async (req, res) => {
		const { uri, content } = req.body

		try {
			const result = await writeContentFile(config, uri, content)
			res.send(JSON.stringify(result, null, '\t'))
		} catch (err) {
			console.error(err)
			res.send(err)
		}
	})

	const server = http.createServer(app)
	server.listen(
		{
			host: 'localhost',
			port: Number(process.env.PORT) || 3005,
		},
		() => {
			const info = /** @type {AddressInfo} */ (server.address())
			logger.info(`Listening at http://localhost:${info.port}`)
		},
	)
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
