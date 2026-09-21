#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEntries, ROOT } from './catalog-lib.mjs'
import { probeAll } from './probe-lib.mjs'
import { enrichMetrics } from './metrics-lib.mjs'
import { buildPublishedCatalog, validatePublishedCatalog } from './published-catalog.mjs'

export async function probeCatalog({ root = ROOT, fetchImpl = authenticatedFetch } = {}) {
  const records = await loadEntries({ directory: path.join(root, 'data/workbenches') })
  const results = await probeAll(records, { fetchImpl })
  const failed = results.filter(({ error }) => error)
  if (failed.length) {
    for (const { record, error } of failed) console.error(`${record.owner}/${record.repository}: [${error.status}] ${error.code}: ${error.message}`)
    throw new Error('探测失败，保留已有目录')
  }
  const categories = JSON.parse(await fs.readFile(path.join(root, 'data/categories.json'), 'utf8'))
  const catalog = await buildPublishedCatalog(results, categories)
  const cachePath = path.join(root, '.cache/metrics.json')
  let previous = {}
  try { previous = JSON.parse(await fs.readFile(cachePath, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const cache = await enrichMetrics(catalog, { previous, fetchImpl, force: process.env.METRICS_FORCE === '1' })
  await validatePublishedCatalog(catalog)
  const output = path.join(root, 'data/index.json')
  const temporary = `${output}.${process.pid}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' })
  await fs.rename(temporary, output)
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  const cacheTemporary = `${cachePath}.${process.pid}.tmp`
  await fs.writeFile(cacheTemporary, `${JSON.stringify(cache, null, 2)}\n`, { flag: 'wx' })
  await fs.rename(cacheTemporary, cachePath)
  console.log(`完整探测并生成 ${records.length} 个工作台`)
}

const token = process.env.GITHUB_TOKEN
const authenticatedFetch = (url, options = {}) => fetch(url, {
  ...options,
  headers: token && url.startsWith('https://api.github.com/')
    ? { ...options.headers, Authorization: `Bearer ${token}` }
    : options.headers
})

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await probeCatalog()
}
