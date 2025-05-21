#!/usr/bin/env node
import path from 'node:path'
import util from 'node:util'

import nodemon from 'nodemon'

const { values, positionals } = util.parseArgs({
	allowPositionals: true,
	strict: false,
	options: {
		dir: { type: 'string', default: '.' },
		watch: { type: 'boolean', default: false },
	},
})
if (positionals.length > 1) {
	throw new Error('Only one positional argument is allowed')
}

if (positionals[0] === 'serve' || (positionals[0] === 'build' && values.watch)) {
	nodemon({
		script: path.join(import.meta.dirname, '../src/sauerkraut.ts'),
		args: process.argv.slice(2),
		exitCrash: false,
		execMap: {
			ts: 'node',
		},
		watch: [
			path.join(import.meta.dirname, '../components'),
			path.join(import.meta.dirname, '../layouts'),
			path.join(import.meta.dirname, '../src'),
			path.join(import.meta.dirname, '../utilities'),
			path.join(
				path.isAbsolute(values.dir) ? values.dir : path.join(process.cwd(), values.dir),
				'sauerkraut.config.ts',
			),
		],
	})
		.on('restart', () => {
			const msg = 'RESTARTING SERVER '
			console.info(msg + '='.repeat(process.stdout.columns).slice(msg.length))
		})
		.on('quit', () => {
			process.exit(0)
		})
} else {
	const { main } = await import('../src/sauerkraut.ts')
	main()
}
