import Nano, { Component, Fragment, h, Helmet, render } from 'nano-jsx'

class Flashcard extends Component {
	idx = 0
	side = 'front'
	count = ''
	text = flashcards.flashcards[0].front

	flip() {
		if (this.side === 'front') {
			this.side = 'back'
		} else if (this.side === 'back') {
			this.side = 'front'
		}
		this.setContent.call(this)
	}

	next() {
		if (this.idx < flashcards.flashcards.length - 1) {
			this.idx = this.idx + 1
			this.setContent.call(this)
		}
	}

	previous() {
		if (this.idx > 0) {
			this.idx = this.idx - 1
			this.setContent()
		}
	}

	random() {
		this.idx = Math.floor(Math.random() * flashcards.flashcards.length)
		this.setContent()
	}

	setContent() {
		this.text = flashcards.flashcards[this.idx][this.side]
		console.log('flip', this.side, this.text)
		this.count = `Card ${this.idx + 1}/${flashcards.flashcards.length}`
	}

	render() {
		return (
			<>
				<p class='count'></p>
				<div class='unit'>
					<button class='previous' onClick={() => this.previous()}>
						Previous
					</button>
					<div class='flashcard-outer'>
						<span class='flashcard'>{this.text}</span>
					</div>
					<button class='next' onClick={() => this.next()}>
						Next
					</button>
				</div>
				<button class='flip' onClick={() => this.flip()}>
					Flip
				</button>
				<button class='random' onClick={() => this.random()}>
					Random
				</button>
			</>
		)
	}
}

class FlashcardList extends Component {
	render() {
		return (
			<>
				<h2>Flashcards</h2>
				<ul>
					{flashcards.flashcards.map((card, idx) => (
						<dt key={idx}>
							<dt>{card.front}</dt>
							<dd>{card.back}</dd>
						</dt>
					))}
				</ul>
			</>
		)
	}
}

const flashcards =
	JSON.parse(`{"flashcards": [
        {
            "front": "red",
            "back": "rojo"
        },
        {
            "front": "blue",
            "back": "azul"
        }
    ]}`) ||
	JSON.parse(`
__flashcard_data__
`)

const App = () => (
	<div>
		<Helmet>
			<title>Flashcards</title>
		</Helmet>

		<body>
			<a href='/'>Go Home</a>
			<hr />
			<h2 class='title'></h2>
			<h3 class='author'></h3>
			<Flashcard />
			{/* <FlashcardList flashcards={flashcards.flashcards} /> */}
			<h2>Individual Ones</h2>
			<div class='list'></div>
		</body>
	</div>
)

render(<App />, document.getElementById('root'))
