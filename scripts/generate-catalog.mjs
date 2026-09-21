#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { generateCatalog, loadEntries, ROOT } from './catalog-lib.mjs'

export async function generatePreview(root = ROOT) {
  const output = path.join(root, '.cache/catalog-preview.json')
  const categories = JSON.parse(await fs.readFile(path.join(root, 'data/categories.json'), 'utf8'))
  const records = await loadEntries({ directory: path.join(root, 'data/workbenches') })
  const contents = `${JSON.stringify(generateCatalog(records, categories), null, 2)}\n`
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, contents)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generatePreview()
  console.log('已生成 .cache/catalog-preview.json')
}
