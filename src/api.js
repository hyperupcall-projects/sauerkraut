import path from 'node:path'
import util, { styleText } from 'node:util'
import url from 'node:url'
import readline from 'node:readline'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'

import { convertInputUriToOutputUri, utilGetContentDirSyncWalker } from '../src/util.js'

/**
 * @import { Config, SkFile, Options, Page, Frontmatter, FileExplorerTree, FileExplorerDirAttrs } from './types.d.ts'
 * @import { AddressInfo } from 'node:net'
 * @import { PathBase } from 'path-scurry'
 * @import { PackageJson } from 'type-fest'
 */

export async function getContentTree(/** @type {Config} */ config) {
	const tree = { type: 'dir', children: {} }
	const walker = utilGetContentDirSyncWalker(config)
	for (let entry of walker) {
		let subtree = tree
		const parts = path.relative(config.contentDir, entry.fullpath()).split('/')
		for (let i = 0; i < parts.length; ++i) {
			const part = parts[i]
			if (part === '') continue

			const attrs = { fullpath: parts.slice(0, i + 1).join('/') }
			if (entry.isDirectory()) {
				if (['Notes', 'Projects'].includes(part)) {
					attrs.sortTier = 1
				} else if (['Journal', 'Resources', 'Flashcards', 'Staging'].includes(part)) {
					attrs.sortTier = 2
				}
				if (
					['Repositories', 'Journal', 'Dailies', 'Thoughts', 'Archives', 'Data'].includes(
						part,
					)
				) {
					attrs.hideChildren = true
				}
			}

			if (i == parts.length - 1) {
				if (entry.isDirectory()) {
					subtree.children[part] = { type: 'dir', children: {}, attrs }
				} else {
					subtree.children[part] = { type: 'file', attrs }
				}
				break
			}

			if (!(part in subtree.children)) {
				subtree.children[part] = { type: 'dir', children: {} }
			}
			subtree = subtree.children[part]
		}
	}

	return tree
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
