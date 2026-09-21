#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createValidator, readEntry, loadEntries, DATA_DIR } from './catalog-lib.mjs'
import { probeEntry, ProbeError } from './probe-lib.mjs'
import { readBounded } from './media-lib.mjs'
import { classifyChanges } from './pr-policy.mjs'

export async function runGate({ env = process.env, fetchImpl = fetch, dataDir = DATA_DIR } = {}) {
  const { GITHUB_TOKEN: token, REPOSITORY: repository, CANDIDATE_SHA: sha } = env
  if (!token || !repository || !/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('缺少可信运行上下文')
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
  const api = async (endpoint, options = {}) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${endpoint}`, { ...options, headers, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`GitHub API ${endpoint} 返回 ${response.status}`)
    return response.json()
  }
  // Resolve on the base repository: workflow_run.pull_requests can be empty for forks.
  const linked = await api(`/commits/${sha}/pulls?per_page=100`)
  const pulls = linked.filter((pull) => pull.state === 'open' && pull.base.ref === 'main' && pull.base.repo.full_name === repository && pull.head.sha === sha)
  if (!pulls.length) {
    console.log('旧提交或已关闭 PR，无需为新的 head 写入结果')
    return { failed: false }
  }
  let failed = false
  for (const pull of pulls) {
    const check = await api('/check-runs', { method: 'POST', body: JSON.stringify({ name: 'Trusted catalog probe', head_sha: sha, status: 'in_progress' }) })
    const report = (conclusion, summary) => api(`/check-runs/${check.id}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'completed', conclusion, output: { title: '目录投稿校验', summary } })
    })
    let directory
    try {
      const files = []
      for (let page = 1; ; page++) {
        const batch = await api(`/pulls/${pull.number}/files?per_page=100&page=${page}`)
        files.push(...batch)
        if (batch.length < 100) break
        if (page >= 30) throw new Error('PR 文件过多，无法完整审核')
      }
      const policy = classifyChanges(files)
      if (policy.type !== 'submission') {
        await report('success', policy.type === 'removal' ? '下架范围检查通过；仍需维护者审批，且不会卸载用户本机工作台。' : '仓库维护 PR；由 Catalog CI 与维护者审核，不执行投稿来源探测。')
        continue
      }
      const { candidate } = policy
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/contents/${candidate.filename}?ref=${sha}`, {
        headers: { ...headers, Accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(30_000)
      })
      if (!response.ok) throw new Error(`无法读取候选 YAML（HTTP ${response.status}）`)
      directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-candidate-'))
      const file = path.join(directory, path.basename(candidate.filename))
      await fs.writeFile(file, await readBounded(response, 32 * 1024, '候选 YAML'), { flag: 'wx' })
      const record = await readEntry(file, await createValidator())
      // Validate against the current trusted catalog, excluding only the replaced entry.
      await fs.cp(dataDir, path.join(directory, 'catalog'), { recursive: true })
      await fs.copyFile(file, path.join(directory, 'catalog', path.basename(file)))
      await loadEntries({ directory: path.join(directory, 'catalog') })
      await probeEntry(record, { fetchImpl: (url, options = {}) => fetchImpl(url, {
        ...options,
        headers: url.startsWith('https://api.github.com/') ? { ...options.headers, Authorization: `Bearer ${token}` } : options.headers
      }) })
      const fresh = await api(`/pulls/${pull.number}`)
      if (fresh.head.sha !== sha) throw new Error('PR 已更新，请等待最新提交的检查')
      await report('success', '固定源码、截图、安装来源和目录唯一性检查通过；仍需维护者核对实测记录及版本来源。')
    } catch (error) {
      const incomplete = error instanceof ProbeError && error.incomplete
      await report('failure', `${incomplete ? '探测暂未完成，请重跑；不能视为通过。' : '校验失败。'}\n${error.message}`)
      console.error(error.message)
      failed = true
    } finally {
      if (directory) await fs.rm(directory, { recursive: true, force: true })
    }
  }

  return { failed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runGate()
  if (result.failed) process.exitCode = 1
}
