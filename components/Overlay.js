import { html } from 'htm/preact'
import { Fragment } from 'preact'
import { useEffect, useState } from 'preact/hooks'

let defaultShouldHide = true
// if (typeof window !== 'undefined') {
// 	if (localStorage.getItem('overlay-should-hide') === null) {
// 		localStorage.setItem('overlay-should-hide', String(defaultShouldHide))
// 	} else {
// 		defaultShouldHide =
// 			localStorage.getItem('overlay-should-hide') === 'true' ? true : false
// 	}
// }
console.log('start', defaultShouldHide)

export function Overlay() {
	const [shouldHide, setShouldHide] = useState(defaultShouldHide)

	useEffect(() => {
		if (typeof window !== 'undefined') {
			if (localStorage.getItem('overlay-should-hide') === null) {
				localStorage.setItem('overlay-should-hide', String(defaultShouldHide))
			} else {
				defaultShouldHide =
					localStorage.getItem('overlay-should-hide') === 'true' ? true : false
			}
		}
	}, [])

	return html`
		<div class="app-overlay">
			<button
				onClick=${() => {
					const newValue = !shouldHide
					setShouldHide(newValue)
					localStorage.setItem('overlay-should-hide', String(newValue))
					console.log('set', newValue)
				}}
			>
				Toggle
			</button>
			<div class="${shouldHide ? 'overlay-hidden' : ''}">
				<h3>Stats</h3>
				<textarea class="__overlay-textarea"></textarea>
				<div><button class="__overlay-textarea-submit">Submit</button></div>
				<div class="__overlay-list"></div>
			</div>
		</div>
	`
}

// {
// 	const /** @type {HTMLTextAreaElement} */ overlayTextareaEl =
// 			document.querySelector('.__overlay-textarea')
// 	const /** @type {HTMLButtonElement} */ overlayTextareaSubmit = document.querySelector(
// 			'.__overlay-textarea-submit',
// 		)
// 	fetch('/api/read-content-file', {
// 		method: 'POST',
// 		headers: {
// 			'Content-Type': 'application/json',
// 		},
// 		body: JSON.stringify({
// 			uri: window.location.pathname,
// 		}),
// 	})
// 		.then((res) => res.text())
// 		.then((text) => {
// 			if (text !== 'undefined') {
// 				overlayTextareaEl.value = text
// 			}
// 		})
// 	overlayTextareaSubmit.addEventListener('click', (ev) => {
// 		console.log(overlayTextareaEl.value)
// 		fetch('/api/write-content-file', {
// 			method: 'POST',
// 			headers: { 'Content-Type': 'application/json' },
// 			body: JSON.stringify({
// 				uri: window.location.pathname,
// 				content: overlayTextareaEl.value,
// 			}),
// 		})
// 			.then((res) => res.json())
// 			.then((json) => {
// 				if (json.success) {
// 					window.location.reload()
// 				}
// 			})
// 	})
// }
