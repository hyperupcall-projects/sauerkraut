import path from 'node:path'
import fs from 'node:fs/promises'
import { PathScurry } from 'path-scurry'

/**
 * @import { Config, Options, SkFile } from './types.d.ts'
 */

export async function convertInputUriToOutputUri(
	/** @type {Config} */ config,
	/** @type {Options} */ options,
	/** @type {string} */ inputUri,
	/** @type {SkFile} */ skFile,
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
		const meta = await skFile?.Meta?.({ config, options })
		if (meta?.slug) {
			return meta.slug
		}

		return path.basename(path.dirname(inputUri))
	}
}

export function utilGetContentDirSyncWalker(/** @type {Config} */ config) {
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
		if (['.git', '.obsidian', 'node_modules'].includes(uri)) {
			return true
		}

		if (uri.startsWith('_') || uri.endsWith('_')) {
			return true
		}
	}

	return false
}

export function utilMaybeAppendIndexHtml(/** @type {string} */ uri) {
	return uri.endsWith('/') ? `${uri}index.html` : uri
}

export async function utilFileExists(/** @type {string} */ filepath) {
	return fs
		.stat(filepath)
		.then(() => true)
		.catch((err) => false)
}
