import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Any catalog-path change must reach the strict gate, including malformed
// extensions, mixed changes and renames. They must not bypass review.
export const needsReview = (files) => files.some((file) =>
  [file.filename, file.previous_filename].some((name) =>
    name?.startsWith('data/workbenches/') && name !== 'data/workbenches/.gitkeep'))

export async function preflight({ env = process.env, fetchImpl = fetch } = {}) {
  const { REPOSITORY: repo, PR_NUMBER: number, CANDIDATE_SHA: sha, GITHUB_TOKEN: token } = env
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !/^[1-9]\d*$/.test(number || '') || !/^[a-f0-9]{40}$/.test(sha || '') || !token) throw new Error('缺少可信运行上下文')
  const api = async (endpoint, method = 'GET', body, allowed = []) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}${endpoint}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000)
    })
    if (allowed.includes(response.status)) return null
    if (!response.ok) throw new Error(`GitHub 分类 API 返回 ${response.status}`)
    return response.json()
  }
  const assertCurrent = async () => {
    const pr = await api(`/pulls/${number}`)
    if (pr.state !== 'open' || pr.head?.sha !== sha || pr.base?.ref !== 'main' || pr.base?.repo?.full_name !== repo) throw new Error('PR 已更新或无法关联，停止分类')
    return pr
  }
  const initial = await assertCurrent()
  const files = []
  for (let page = 1; ; page++) {
    if (page > 30) throw new Error('PR 文件数量超出审核上限')
    const batch = await api(`/pulls/${number}/files?per_page=100&page=${page}`)
    files.push(...batch)
    if (batch.length < 100) break
  }
  if (files.length !== initial.changed_files) throw new Error('PR 文件列表不完整，停止分类')
  await assertCurrent()
  const review = needsReview(files)
  if (!review) {
    await api('/labels', 'POST', { name: 'feature', color: 'a2eeef', description: '非工作台 YAML 投稿，需要维护者评估' }, [422])
    await api(`/issues/${number}/labels`, 'POST', { labels: ['feature'] })
    await assertCurrent()
    const summary = '非工作台 YAML 投稿，已标记 feature；安全审核不适用，跳过来源探测和 LLM。仍需维护者评估。'
    await api('/check-runs', 'POST', { name: 'Workbench security review', head_sha: sha, status: 'completed', conclusion: 'neutral', output: { title: '非 YAML 投稿：安全审核已跳过', summary } })
    if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  }
  if (env.GITHUB_OUTPUT) await fs.appendFile(env.GITHUB_OUTPUT, `review=${review}\n`)
  return review
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await preflight() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
