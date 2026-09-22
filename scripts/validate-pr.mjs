#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { classifyChanges } from './pr-policy.mjs'

const [base, head = 'HEAD'] = process.argv.slice(2)
if (!base) throw new Error('用法：node scripts/validate-pr.mjs <base-sha> [head-sha]')
const output = execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', base, head], { encoding: 'utf8' })
const fields = output.split('\0').filter(Boolean)
const files = []
while (fields.length) {
  const status = fields.shift()
  const filename = fields.shift()
  if (status.startsWith('R') || status.startsWith('C')) {
    files.push({ status: 'renamed', previous_filename: filename, filename: fields.shift() })
  } else {
    files.push({ status: ({ A: 'added', M: 'modified', D: 'removed' })[status] || status, filename })
  }
}
const trusted = ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(process.env.AUTHOR_ASSOCIATION)
console.log(`PR 类型：${classifyChanges(files, { allowCatalogMaintenance: trusted }).type}`)
