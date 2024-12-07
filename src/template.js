/**
 * @import {Config, Options} from './types.d.ts'
 */

export const partials = {
	beginHtml(vars) {
		return `<!DOCTYPE html>
<html lang="en">\n`
	},
	endHtml(vars) {
		return `</html>\n`
	},
	beginHead(vars) {
		return `<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="referrer" content="same-origin" />
		<!-- TODO -->
		<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&family=Rubik:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">
		<style>
			*, *::before, *::after {
				box-sizing: border-box;
			  font-family: "Rubik"
		}
		</style>
		${'<title>{{ Title }}</title>'}
		${
			vars.env === 'development'
				? `<link rel="stylesheet" href="/__/css/overlay.css" />
				<script defer src="/__/js/overlay.js"></script>\n`
				: ''
		}
		${vars.__header_content ? vars.__header_content : ''}\n`
	},
	endHead(vars) {
		return `</head>\n`
	},
	beginBody(vars) {
		return `<body>
			${
				vars.env === 'debug'
					? `<div class="__overlay">
				<div class="__overlay-inner">
					<button class="__overlay-button">See Stats</button>
					<div class="__overlay-stats __overlay-stats-hidden">
						<h3>Stats</h3>
					</div>
				</div>
			</div>
			`
					: ``
			}\n`
	},
	endBody(vars) {
		return `</body>\n`
	},
}

export const layouts = {
	default(vars) {
		return `${partials.beginHtml(vars)}
${partials.beginHead(vars)}
${partials.endHead(vars)}
${partials.beginBody(vars)}
${vars.body}
${partials.endBody(vars)}
${partials.endHtml(vars)}\n`
	},
}

export function renderLayout(
	/** @type {string} */ layoutName,
	/** @type {Record<string, unknown>} */ vars,
	/** @type {Record<string, () => string>} */ partials,
	/** @type {Config} */ config,
	/** @type {Options} */ options,
) {
	if (layoutName in layouts) {
		return layouts[layoutName](vars, config, options)
	} else {
		return layouts.default(vars, config, options)
	}
}
