#!/usr/bin/env node
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './catalog-lib.mjs'
import { execFileSync } from 'node:child_process'
import { validatePublishedCatalog } from './published-catalog.mjs'

export async function publishMetadata(root = ROOT) {
  const bytes = await fs.readFile(path.join(root, 'dist/catalog.json'))
  const catalog = JSON.parse(bytes)
  await validatePublishedCatalog(catalog)
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  await fs.writeFile(path.join(root, 'dist/catalog.sha256'), `${sha256}  catalog.json\n`)
  await fs.writeFile(path.join(root, 'dist/publication.json'), JSON.stringify({ schemaVersion: 1, sourceCommit, sha256, entries: catalog.workbenches.length }, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await publishMetadata()
}
