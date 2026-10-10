import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { toCssVariables } from '../src/css.ts'

const outFile = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/tokens.css')

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, toCssVariables())
