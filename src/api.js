import path from 'node:path'
import util, { styleText } from 'node:util'
import url from 'node:url'
import readline from 'node:readline'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'

import { convertInputUriToOutputUri, utilGetContentDirSyncWalker } from '../src/util.js'

/**
 * @import { Config, SkFile, Options, Page, Frontmatter } from './types.d.ts'
 * @import { AddressInfo } from 'node:net'
 * @import { PathBase } from 'path-scurry'
 * @import { PackageJson } from 'type-fest'
 */

export async function getContentTree(/** @type {Config} */ config) {
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
}

export async function getContentList(/** @type {Config} */ config) {
	const json = []
	const walker = utilGetContentDirSyncWalker(config)
	for (let entry of walker) {
		if (entry.isDirectory()) {
			continue
		}

		const filepath = path.relative(config.contentDir, entry.fullpath())
		if (filepath !== '') {
			// TODO tenConfig
			json.push(await convertInputUriToOutputUri(config, {}, filepath, {}))
		}
	}

	json.sort()
	return json
}

export async function readContentFile(
	/** @type {Config} */ config,
	/** @type {string} */ uri,
) {
	const filepath = path.join(
		config.contentDir,
		contentMap.get(utilMaybeAppendIndexHtml(uri)),
	)
	const content = await fsp.readFile(filepath, 'utf-8')
	return content
}

export async function writeContentFile(
	/** @type {Config} */ config,
	/** @type {string} */ uri,
	/** @type {string} */ content,
) {
	const filepath = path.join(config.contentDir, contentMap.get(uri))
	if (content === null || content === undefined) {
		throw new TypeError('Invalid "content"')
	}
	await fsp.writeFile(filepath, content)
	return { sucess: true }
}
