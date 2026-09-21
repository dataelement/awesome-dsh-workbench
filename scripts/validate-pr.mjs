#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

const [base, head = 'HEAD'] = process.argv.slice(2)
if (!base) {
  console.error('用法：node scripts/validate-pr.mjs <base-sha> [head-sha]')
  process.exit(2)
}

const output = execFileSync('git', ['diff', '--name-status', '--find-renames', base, head], { encoding: 'utf8' })
const changes = output.trim() ? output.trim().split('\n').map((line) => {
  const [status, ...paths] = line.split('\t')
  return { status, paths }
}) : []
const catalogChanges = changes.filter(({ paths }) => paths.some((file) => /^data\/workbenches\/.*\.yml$/.test(file)))

if (catalogChanges.length === 0) {
  console.log('此 PR 不修改工作台目录数据，无需执行投稿范围检查')
  process.exit(0)
}

const errors = []
const allowedFiles = new Set(['dist/catalog.json'])
if (catalogChanges.length !== 1) errors.push('工作台投稿 PR 必须只修改一个 data/workbenches/owner__repo.yml 文件')
const change = catalogChanges[0]
if (change.status !== 'A' && change.status !== 'M') errors.push('目录条目只能新增或修改，删除和重命名请由维护者单独处理')
const file = change.paths.at(-1)
if (!/^data\/workbenches\/[A-Za-z0-9_.-]+__[A-Za-z0-9_.-]+\.yml$/.test(file)) errors.push(`路径不符合 data/workbenches/owner__repo.yml：${file}`)
for (const { paths } of changes) {
  for (const changedFile of paths) {
    if (changedFile !== file && !allowedFiles.has(changedFile)) errors.push(`投稿 PR 包含无关文件：${changedFile}`)
  }
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`投稿范围有效：${file}`)
