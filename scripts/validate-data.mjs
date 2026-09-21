#!/usr/bin/env node
import { loadEntries } from './catalog-lib.mjs'

try {
  const entries = await loadEntries()
  console.log(`目录数据有效：${entries.length} 个工作台`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
