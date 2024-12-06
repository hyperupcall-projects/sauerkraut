const overlayButtonEl = document.querySelector('.__overlay-button')
const overlayStatsEl = document.querySelector('.__overlay-stats')

overlayButtonEl.addEventListener('click', (ev) => {
	overlayStatsEl.classList.toggle('__overlay-stats-hidden')
})
