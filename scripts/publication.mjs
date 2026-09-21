#!/usr/bin/env node
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { validatePublishedCatalog } from './published-catalog.mjs'

const bytes = await fs.readFile('dist/catalog.json')
const catalog = JSON.parse(bytes)
await validatePublishedCatalog(catalog)
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
await fs.writeFile('dist/catalog.sha256', `${sha256}  catalog.json\n`)
await fs.writeFile('dist/publication.json', JSON.stringify({ schemaVersion: 1, sourceCommit, sha256, entries: catalog.workbenches.length }, null, 2) + '\n')
