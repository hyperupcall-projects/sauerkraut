import { h } from 'preact'
import { renderToString } from 'preact-render-to-string'
import * as util from '../src/util.js'

import { FileExplorer } from '#components/FileExplorer.js'
import { MetaTags } from './_.js'
import { getContentTree } from '../src/api.js'
import { Overlay } from '#components/Overlay.js'

/**
 * @import { Config, LayoutData } from '../src/types.d.ts'
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
	/** @type {LayoutData} */ { layout, body, environment, title },
) {
	const ssg = {
		fileTree: await getContentTree(config),
	}

	const features = {
		katex: true,
		mermaid: true,
		filetree: true,
		overlay: environment === 'development',
	}

	return html`<!doctype html>
		<html>
			<head>
				${MetaTags}
				${features.filetree
					? html`<script type="importmap">
							{
								"imports": {
									"preact": "/static/bundled/preact.js",
									"preact/hooks": "/static/bundled/preact-hooks.js",
									"htm/preact": "/static/bundled/htm-preact.js",
									"#components/": "/components/",
									"#utilities/": "/utilities/"
								}
							}
						</script>`
					: ``}
				${features.katex
					? html` <link rel="stylesheet" href="/static/bundled/katex.css" />
							<script type="module" src="/static/bundled/katex.js"></script>
							<script type="module" src="/static/bundled/katex-mhchem.js"></script>
							<script type="module" src="/static/bundled/katex-copy-tex.js"></script>
							<script type="module">
								function __initialize_katex() {
									renderMathInElement(document.body, {
										options: {
											strict: false,
										},
										delimiters: [
											{ left: '$$', right: '$$', display: true },
											{ left: '$', right: '$', display: false },
										],
									})
								}
							</script>`
					: ``}
				${
					/*features.mermaid
							? html`<script type="module" src="/static/bundled/mermaid.js"></script>`
							: ``*/ ''
				}
				${features.overlay
					? html`
							<script type="module">
								import { h, hydrate } from 'preact'
								import { Overlay } from '#components/Overlay.js'

								hydrate(
									h(() => Overlay()),
									document.querySelector('#app-overlay'),
								)
							</script>
						`
					: ``}
				${features.filetree
					? html`
							<script type="module">
								import { h, hydrate } from 'preact'
								import { FileExplorer } from '#components/FileExplorer.js'

								const fileTree = JSON.parse(\`${JSON.stringify(ssg.fileTree)}\`)
								hydrate(
									h(() => FileExplorer(fileTree)),
									document.querySelector('#app-file-explorer'),
								)
							</script>
						`
					: ``}

				<title>${title}</title>
			</head>
			<body>
				${features.overlay
					? html`<div id="app-overlay">${renderToString(h(() => Overlay()))}</div>`
					: ``}
				<div class="page${features.filetree ? ' with-filetree' : ''}">
					${features.filetree
						? html`<div id="app-file-explorer">
								${renderToString(h(() => FileExplorer(ssg.fileTree)))}
							</div>`
						: ``}
					<main id="content">${body}</main>
				</div>
			</body>
		</html>`
}
