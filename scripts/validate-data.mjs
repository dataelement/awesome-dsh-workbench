import path from 'node:path'
import { createValidator, readEntry, ROOT } from './catalog-lib.mjs'
import { loadEntries } from './catalog-lib.mjs'

try {
  const entries = await loadEntries()
  console.log(`目录数据有效：${entries.length} 个工作台`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}

await readEntry(path.join(ROOT, 'examples/workbench.yml'), await createValidator(), { example: true })
console.log('example 与正式 Schema 一致（占位来源不做联网探测）')
