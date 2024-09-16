#!/usr/bin/env node
import { main } from '../src/ten.js'

await main().catch((err) => {
    console.error(err)
})
