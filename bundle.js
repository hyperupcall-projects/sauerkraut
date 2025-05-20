#!/usr/bin/env node
import path from 'node:path'
import util, { styleText } from 'node:util'
import url from 'node:url'
import readline from 'node:readline'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import esbuild from 'esbuild'

import { rollup } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'

const outDir = url.fileURLToPath(import.meta.resolve('./static/bundled'))

await esbuild.build({
	entryPoints: [url.fileURLToPath(import.meta.resolve('mermaid/dist/mermaid.esm.mjs'))],
	outdir: outDir,
	bundle: true,
})

const importFrom = (/** @type {string} */ importId) => ({
	importId,
	chunkId: importId.split('/').join('-'),
	resolveUri: importId,
})

const imports = [
	importFrom('preact'),
	importFrom('preact/compat'),
	importFrom('preact/debug'),
	importFrom('preact/devtools'),
	importFrom('preact/hooks'),
	importFrom('htm'),
	importFrom('htm/preact'),
	importFrom('htm/preact/standalone'),
	importFrom('katex'),
	...[
		'auto-render',
		'mhchem',
		'copy-tex',
		'mathtex-script-type',
		'render-a11y-string',
	].map((name) => ({
		importId: `katex/contrib/${name}`,
		chunkId: `katex-${name}`,
		resolveUri: `katex/contrib/${name}`,
	})),
	importFrom('notie'),
	// {
	// 	importId: 'mermaid',
	// 	chunkId: 'mermaid',
	// 	resolveUri: 'mermaid/dist/mermaid.mjs',
	// },
	{
		importId: 'jheat.js',
		chunkId: 'jheat',
		resolveUri: 'jheat.js/dist/heat.esm.js',
	},
]

let bundle
try {
	bundle = await rollup({
		input: Object.fromEntries(
			imports.map(({ importId, chunkId }) => [chunkId, importId]),
		),
		plugins: [nodeResolve()],
	})
	const importMap = {
		imports: Object.fromEntries(
			imports.map(({ importId, chunkId }) => [importId, `/components/${chunkId}.js`]),
		),
	}
	await fsp.rm(outDir, { recursive: true })
	await fsp.mkdir(outDir, { recursive: true })
	await bundle.write({
		dir: outDir,
		format: 'es',
		manualChunks(id) {
			if (id.includes('mermaid')) {
				return 'mermaid'
			}
		},
	})
	console.log(importMap)
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
	'modern-normalize.css': 'modern-normalize/modern-normalize.css',
})) {
	const file = url.fileURLToPath(import.meta.resolve(identifier))
	await fsp.writeFile(`${outDir}/${outputFilename}`, await fsp.readFile(file, 'utf-8'))
}
