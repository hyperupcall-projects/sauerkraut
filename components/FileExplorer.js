import { useContext, useEffect, useState } from 'preact/hooks'
import { html } from 'htm/preact'
import { RenderingStateContext } from '#utilities/contexts.js'

/**
 * @import { FileExplorerTree } from '../src/types.js'
 */

export function FileExplorer(/** @type {string[]} filelist */ fileTree) {
	const renderingState = useContext(RenderingStateContext)
	const [tree, setTree] = useState(/** @type {FileExplorerTree} */ (fileTree))

	useEffect(() => {
		if (renderingState.environment === 'development') {
			const aborter = new AbortController()
			fetch('/api/get-content-tree', { method: 'POST', signal: aborter.signal })
				.then((res) => res.json())
				.then((json) => {
					setTree(json)
					console.log(json)
				})
			return () => aborter.abort()
		}
	}, [])

	let /** @type {any} */ renderthis = []
	walk(tree.children, 0)
	function walk(/** @type {any} */ node, /** @type {number} */ ident = 0) {
		for (const name in node) {
			if (node[name].type === 'file') {
				renderthis.push(
					html`<li>
						<a style="margin-inline-start: ${ident * 16}px" href="${name}">${name}</a>
					</li>`,
				)
			} else if (node[name].type === 'dir') {
				const attrs = node[name].attrs ?? {}
				renderthis.push(
					html`<li>
						<a style="margin-inline-start: ${ident * 16}px" href="${name}">${name}/</a>
					</li>`,
				)

				if (attrs.hideChildren) {
					return
				}

				walk(node[name].children, ident + 1)
			}
		}
	}

	return html`<div id="app-file-explorer">
		<ul>
			${renderthis}
		</ul>
	</div>`
}
