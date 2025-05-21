import rr from 'railroad-diagrams'

export function markdownMermaid(md) {
	const wrap = (/** @type {string} */ code) => {
		return `<div class="mermaid">${code}</div>`
	}

	const origin = md.renderer.rules.fence.bind(md.renderer.rules)
	md.renderer.rules.fence = (tokens, idx, options, ...resParams) => {
		const token = tokens[idx]
		const code = token.content.trim()

		if (token.info === 'mermaid') {
			return wrap(code)
		}
		const firstLine = code.split(/\n/)[0].trim()
		if (
			firstLine === 'gantt' ||
			firstLine === 'sequenceDiagram' ||
			firstLine === 'classDiagram' ||
			firstLine === 'gitGraph' ||
			firstLine.match(/^graph (?:TB|BT|RL|LR|TD);?$/)
		) {
			return wrap(code)
		}

		return origin(tokens, idx, options, ...resParams)
	}
}

// TODO: eval
export function markdownRailroadDiagrams(md) {
	const origin = md.renderer.rules.fence.bind(md.renderer.rules)
	md.renderer.rules.fence = (tokens, idx, options, ...resParams) => {
		const token = tokens[idx]
		const code = token.content.trim()

		if (token.info === 'railroad') {
			const diagram = { content: '' }
			eval(`diagram.content = ${code}`)
			return diagram.content.toString()
		}

		return origin(tokens, idx, options, ...resParams)
	}
}
