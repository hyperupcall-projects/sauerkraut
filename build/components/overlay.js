{
	const overlayButtonEl = document.querySelector('.__overlay-button')
	const overlayStatsEl = document.querySelector('.__overlay-stats')

	fetch('/api/get-content-list', { method: 'POST' })
		.then((res) => res.json())
		.then((json) => {
			const ul = document.createElement('ul')
			for (const filepath of json) {
				const li = document.createElement('li')
				const a = document.createElement('a')
				a.href = filepath
				a.text = filepath
				li.appendChild(a)
				ul.appendChild(li)
			}
			document.querySelector('.__overlay-list').replaceWith(ul)
		})

	if (localStorage.getItem('__overlay-stats-should-hide') === 'false') {
		overlayStatsEl.classList.remove('__overlay-stats-hidden')
	}
	overlayButtonEl.addEventListener('click', (ev) => {
		const hiddenState = String(overlayStatsEl.classList.toggle('__overlay-stats-hidden'))
		localStorage.setItem('__overlay-stats-should-hide', hiddenState)
	})
}

{
	const /** @type {HTMLTextAreaElement} */ overlayTextareaEl =
			document.querySelector('.__overlay-textarea')
	const /** @type {HTMLButtonElement} */ overlayTextareaSubmit = document.querySelector(
			'.__overlay-textarea-submit',
		)
	fetch('/api/read-content-file', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			uri: window.location.pathname,
		}),
	})
		.then((res) => res.text())
		.then((text) => {
			if (text !== 'undefined') {
				overlayTextareaEl.value = text
			}
		})
	overlayTextareaSubmit.addEventListener('click', (ev) => {
		console.log(overlayTextareaEl.value)
		fetch('/api/write-content-file', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				uri: window.location.pathname,
				content: overlayTextareaEl.value,
			}),
		})
			.then((res) => res.json())
			.then((json) => {
				if (json.success) {
					window.location.reload()
				}
			})
	})
}
