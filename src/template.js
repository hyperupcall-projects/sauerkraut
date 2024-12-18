const html = String.raw

/**
 * @import { Config } from './types'
 */

export const sauerkrautHeadTags = (
	/** @type {string} */ layout,
	/** @type {string} */ environment,
	/** @type {string} */ title,
	/** @type {{ katex: boolean, mermaid: boolean }} */ features,
) =>
	html`<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="referrer" content="same-origin" />
		${environment === 'development'
			? `<link rel="stylesheet" href="/static/components/overlay.css" />
					<script type="module" src="/static/components/overlay.js"></script>`
			: ``}
		${features.katex
			? `<link rel="stylesheet" href="/static/bundled/katex.min.css" />
		<script defer src="/static/bundled/katex.js"></script>
		<script defer src="/static/bundled/katex-mhchem.js"></script>
		<script defer src="/static/bundled/katex-copy-tex.js"></script>
		<script defer>
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
		${features.mermaid ? `<script defer src="/static/bundled/mermaid.js"></script>` : ``}
		<style>
			*,
			*::before,
			*::after {
				box-sizing: border-box;
			}
		</style>
		<title>${title}</title>`

export const sauerkrautBodyTags = (/** @type {string} */ environment) =>
	environment === 'development'
		? html`<div class="__overlay">
				<div class="__overlay-inner">
					<button class="__overlay-button">See Stats</button>
					<div class="__overlay-stats __overlay-stats-hidden">
						<h3>Stats</h3>
						<textarea class="__overlay-textarea"></textarea>
						<div><button class="__overlay-textarea-submit">Submit</button></div>
						<div class="__overlay-list"></div>
					</div>
				</div>
			</div>`
		: ``

/** @type {(arg0: Parameters<Config['createHtml']>[1]) => string} */
export const Html = ({ layout, body, environment, title }) => {
	return html`<!doctype html>
		<html>
			<head>
				${sauerkrautHeadTags(layout, environment, title, { katex: true, mermaid: true })}
			</head>
			<body>
				${sauerkrautBodyTags(environment)} ${body}
			</body>
		</html>`
}
