#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadEntries, ROOT } from './catalog-lib.mjs'
import { probeAll } from './probe-lib.mjs'
import { buildPublishedCatalog } from './published-catalog.mjs'

const records = await loadEntries()
const token = process.env.GITHUB_TOKEN
const fetchImpl = (url, options = {}) => fetch(url, {
  ...options,
  headers: token && url.startsWith('https://api.github.com/')
    ? { ...options.headers, Authorization: `Bearer ${token}` }
    : options.headers
})
const results = await probeAll(records, { fetchImpl })
const failed = results.filter(({ error }) => error)
if (failed.length) {
  for (const { record, error } of failed) console.error(`${record.owner}/${record.repository}: [${error.status}] ${error.code}: ${error.message}`)
  process.exit(1)
}
const categories = JSON.parse(await fs.readFile(path.join(ROOT, 'data/categories.json'), 'utf8'))
const catalog = await buildPublishedCatalog(results, categories)
await fs.mkdir(path.join(ROOT, 'dist'), { recursive: true })
await fs.writeFile(path.join(ROOT, 'dist/catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`完整探测并生成 ${records.length} 个工作台`)
