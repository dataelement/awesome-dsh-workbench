#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { generateCatalog, loadEntries, ROOT } from './catalog-lib.mjs'

const output = path.join(ROOT, 'dist/catalog.json')
const categories = JSON.parse(await fs.readFile(path.join(ROOT, 'data/categories.json'), 'utf8'))
const contents = `${JSON.stringify(generateCatalog(await loadEntries(), categories), null, 2)}\n`

if (process.argv.includes('--check')) {
  let current = ''
  try { current = await fs.readFile(output, 'utf8') } catch {}
  if (current !== contents) {
    console.error('dist/catalog.json 不是最新结果，请运行 npm run generate')
    process.exitCode = 1
  } else {
    console.log('dist/catalog.json 已是最新结果')
  }
} else {
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, contents)
  console.log('已生成 dist/catalog.json')
}
