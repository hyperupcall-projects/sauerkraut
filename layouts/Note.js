import { h } from 'preact'
import { renderToString } from 'preact-render-to-string'
import * as util from '../src/util.js'

import { FileExplorer } from '#components/FileExplorer.js'
import { MetaTags } from './_.js'
import { getContentTree } from '../src/api.js'
import { Overlay } from '#components/Overlay.js'

/**
 * @import { Config, LayoutData, SkJsHead } from '../src/types.d.ts'
 *
 * @typedef {Object} Features
 * @property {boolean} katex
 * @property {boolean} mermaid
 * @property {boolean} filetree
 * @property {boolean} overlay
 */

const html = String.raw

export async function NoteLayout(
	/** @type {Config} */ config,
	/** @type {SkJsHead} */ head,
	/** @type {LayoutData} */ layoutData,
	params,
) {
	const { layout, body, environment, title } = layoutData

	const ssg = {
		fileTree: await getContentTree(config),
	}

	const features = {
		katex: true,
		mermaid: true,
		railroadDiagrams: true,
		filetree: false,
		overlay: false,
		// filetree: true,
		// overlay: environment === 'development',
	}

	return html`<!doctype html>
		<html>
			<head>
				${MetaTags}
				${features.filetree
					? html`<script type="importmap">
							{
								"imports": {
									"preact": "/bundled/preact.js",
									"preact/hooks": "/bundled/preact-hooks.js",
									"htm/preact": "/bundled/htm-preact.js",
									"#components/": "/components/",
									"#utilities/": "/utilities/"
								}
							}
						</script>`
					: ``}
				${features.katex
					? html`
							<link rel="stylesheet" href="/bundled/katex.css" />
							<script type="module" src="/bundled/katex.js"></script>
							<script type="module" src="/bundled/katex-mhchem.js"></script>
							<script type="module" src="/bundled/katex-copy-tex.js"></script>
							<script type="module" defer>
								import renderMathInElement from '/bundled/katex-auto-render.js'

								const el = document.querySelector('.markdown-latex')
								if (el) {
									renderMathInElement(el, {
										options: {
											strict: false,
										},
										delimiters: [
											{ left: '$$', right: '$$', display: true },
											{ left: '$', right: '$', display: false },
										],
									})
								}
							</script>
						`
					: ``}
				${features.mermaid
					? html`<script type="module">
							import mermaid from '/bundled/mermaid.js'
							mermaid.initialize({ startOnLoad: true })
						</script>`
					: ``}
				${features.railroadDiagrams
					? html`<link rel="stylesheet" href="/bundled/railroad-diagrams.css" />`
					: ``}
				${features.overlay
					? html`
							<script type="module">
								import { h, hydrate } from 'preact'
								import { Overlay } from '#components/Overlay.js'

								hydrate(
									h(() => Overlay()),
									document.querySelector('.app-overlay'),
								)
							</script>
						`
					: ``}
				${features.filetree
					? html`
							<script type="module">
								import { h, hydrate } from 'preact'
								import { FileExplorer } from '#components/FileExplorer.js'

								const fileTree = ${JSON.stringify(ssg.fileTree)}
								hydrate(
									h(() => FileExplorer(fileTree)),
									document.querySelector('#app-file-explorer'),
								)
							</script>
						`
					: ``}

				<title>${title}</title>
				${await config.createHead(config, layoutData, params)}
				<!-- From "*.sk.js" -->
				${head}
			</head>
			<body>
				${features.overlay ? html`${renderToString(h(() => Overlay()))}` : ``}
				${features.filetree
					? html` ${renderToString(h(() => FileExplorer(ssg.fileTree)))} `
					: ``}
				${await config.createContent(config, layoutData, params)}
			</body>
		</html>`
}
