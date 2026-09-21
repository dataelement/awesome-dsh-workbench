#!/usr/bin/env node
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const bytes = await fs.readFile('dist/catalog.json')
const catalog = JSON.parse(bytes)
if (!catalog.workbenches.every((entry) => entry.probe?.status === 'ok')) throw new Error('发布必须使用完整联网探测生成的目录')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
await fs.writeFile('dist/catalog.sha256', `${sha256}  catalog.json\n`)
await fs.writeFile('dist/publication.json', JSON.stringify({ schemaVersion: 1, sourceCommit, sha256, entries: catalog.workbenches.length }, null, 2) + '\n')
