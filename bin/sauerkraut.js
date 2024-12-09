#!/usr/bin/env node
import { main } from '../src/sauerkraut.js'

await main().catch((err) => {
	console.error(err)
})
