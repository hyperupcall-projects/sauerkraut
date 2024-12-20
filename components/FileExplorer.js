import { useContext, useEffect, useState } from 'preact/hooks'
import { html } from 'htm/preact'
import { RenderingStateContext } from '#utilities/contexts.js'

/**
 * @param {string[]} filelist
 */
export function FileExplorer(filelist) {
	const renderingState = useContext(RenderingStateContext)
	const [files, setFiles] = useState(filelist)

	useEffect(() => {
		if (renderingState.environment === 'development') {
			const aborter = new AbortController()
			fetch('/api/get-content-list', { method: 'POST', signal: aborter.signal })
				.then((res) => res.json())
				.then((json) => {
					setFiles(json)
				})
			return () => aborter.abort()
		}
	}, [])

	return html`<ul>
		${files.map((name) => {
			return html`<li><a href=${name}>${name}</a></li>`
		})}
	</ul>`
}
