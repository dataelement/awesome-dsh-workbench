#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createValidator, readEntry } from './catalog-lib.mjs'
import { probeEntry, ProbeError } from './probe-lib.mjs'

const { GITHUB_TOKEN: token, REPOSITORY: repository, PR_NUMBER: number, GITHUB_OUTPUT: output } = process.env
if (!token || !repository || !number) throw new Error('缺少 GITHUB_TOKEN、REPOSITORY 或 PR_NUMBER')
const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
const api = async (endpoint) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, { headers })
  if (!response.ok) throw new Error(`GitHub API ${endpoint} 返回 ${response.status}`)
  return response.json()
}
const reportCheck = async (conclusion, title, summary) => {
  const response = await fetch(`https://api.github.com/repos/${repository}/check-runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Trusted catalog probe',
      head_sha: pull.head.sha,
      status: 'completed',
      conclusion,
      output: { title, summary }
    })
  })
  if (!response.ok) throw new Error(`无法写入探测状态（HTTP ${response.status}）`)
}

const pull = await api(`/pulls/${number}`)
const files = await api(`/pulls/${number}/files?per_page=100`)
if (files.length !== 1) throw new Error('投稿 PR 必须只修改一份 YAML')
const candidate = files[0]
if (!['added', 'modified'].includes(candidate.status) || !/^data\/workbenches\/[A-Za-z0-9_.-]+__[A-Za-z0-9_.-]+\.yml$/.test(candidate.filename)) {
  throw new Error('投稿 PR 只能新增或修改 data/workbenches/owner__repo.yml')
}
const contentResponse = await fetch(`https://api.github.com/repos/${repository}/contents/${candidate.filename}?ref=${pull.head.sha}`, {
  headers: { ...headers, Accept: 'application/vnd.github.raw+json' }
})
if (!contentResponse.ok) throw new Error(`无法读取候选 YAML（HTTP ${contentResponse.status}）`)
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-candidate-'))
const file = path.join(directory, path.basename(candidate.filename))
await fs.writeFile(file, await contentResponse.text(), { flag: 'wx' })

try {
  const record = await readEntry(file, await createValidator())
  await probeEntry(record, { fetchImpl: (url, options = {}) => fetch(url, {
    ...options,
    headers: url.startsWith('https://api.github.com/')
      ? { ...options.headers, Authorization: `Bearer ${token}` }
      : options.headers
  }) })
  await reportCheck('success', '目录探测通过', '候选 YAML、仓库与发布来源均通过受信任探测。')
  if (output) await fs.appendFile(output, 'gate_status=passed\n')
  console.log('候选 YAML 与远程工作台探测均通过')
} catch (error) {
  if (error instanceof ProbeError && error.incomplete) {
    await reportCheck('neutral', '目录探测暂未完成', error.message)
    if (output) await fs.appendFile(output, 'gate_status=incomplete\n')
    console.log(`探测暂未完成：${error.message}`)
  } else {
    throw error
  }
} finally {
  await fs.rm(directory, { recursive: true, force: true })
}
