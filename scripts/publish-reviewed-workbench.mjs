import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function buildBrief({record, repository, number, sha, model}) {
  const clean = value => String(value || '').replace(/[\r\n<>]/g, ' ').replace(/@/g, '＠').slice(0, 600)
  return `工作台上新｜${clean(record.name)}\n\n${clean(record.description.zh)}\n\n项目：${record.url}\n审核：${model} 静态内容审核与目录 CI 通过，投稿已合并。\nPR：https://github.com/${repository}/pull/${number}\n投稿版本：${sha.slice(0, 12)}\n\n本次为静态审核，未验证 Desktop 安装、运行及跨平台兼容；不代表完整安全审计。`
}
export async function publish({env = process.env, fetchImpl = fetch, merge = (repo, number, sha) => execFileSync('gh', ['pr','merge',String(number),'--repo',repo,'--merge','--match-head-commit',sha], {stdio:'pipe'}), pause = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  const brief = JSON.parse(await fs.readFile(env.SECURITY_BRIEF_FILE, 'utf8'))
  const {repository:repo, number, sha, body} = brief
  if (repo !== env.REPOSITORY || sha !== env.CANDIDATE_SHA || String(number) !== env.PR_NUMBER) throw new Error('审核与发布上下文不一致')
  const webhook = new URL(env.FEISHU_WORKBENCH_WEBHOOK || '')
  if (webhook.origin !== 'https://open.feishu.cn' || !/^\/open-apis\/bot\/v2\/hook\/[a-f0-9-]+$/.test(webhook.pathname) || webhook.search || webhook.hash) throw new Error('飞书群机器人配置无效')
  const api = async (endpoint, method = 'GET', payload) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}${endpoint}`, {method, ...(payload ? {body:JSON.stringify(payload)} : {}), headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)})
    if (!response.ok) throw new Error(`发布检查 API 返回 ${response.status}`)
    return response.json()
  }
  const notificationId = `feishu:${sha}:${brief.evidenceDigest}`
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    const pr = await api(`/pulls/${number}`)
    if (pr.head.sha !== sha || (pr.body || '') !== body || (pr.state !== 'open' && !pr.merged)) throw new Error('PR 已变化，停止自动发布')
    const checks = await api(`/commits/${sha}/check-runs?per_page=100&filter=latest`)
    if (checks.check_runs.some(c => c.name === 'Feishu workbench brief' && c.external_id === notificationId && c.conclusion === 'success')) { console.log('此审核快照已通知，跳过重复发送'); return }
    if (checks.total_count > 100) throw new Error('检查数量超出发布上限')
    // The current workflow job is still running. Require the three independent
    // acceptance checks, and reject any other completed failed check.
    const required = ['validate','Trusted catalog probe','Workbench security review']
    if (checks.check_runs.some(c => c.status === 'completed' && !['success','neutral','skipped'].includes(c.conclusion))) throw new Error('存在失败的 CI 检查，停止合并')
    ready = required.every(name => checks.check_runs.some(c => c.name === name && c.status === 'completed' && c.conclusion === 'success')) && checks.check_runs.every(c => c.name === 'Run trusted security reviewer' || c.status === 'completed')
    if (ready) break
    await pause(10000)
  }
  if (!ready) throw new Error('等待目录 CI 超时，未合并或通知')
  const before = await api(`/pulls/${number}`)
  if (before.head.sha !== sha || (before.body || '') !== body) throw new Error('PR 已变化，停止合并')
  if (!before.merged) {
    try { await merge(repo, number, sha) } catch { throw new Error('自动合并未成功，未发送上新通知') }
  }
  const merged = await api(`/pulls/${number}`)
  if (!merged.merged || merged.head.sha !== sha) throw new Error('无法确认已审核投稿的合并结果')
  const response = await fetchImpl(webhook.href, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msg_type:'text',content:{text:buildBrief(brief)}}),signal:AbortSignal.timeout(30000)})
  if (!response.ok) throw new Error(`飞书通知返回 HTTP ${response.status}；PR 已合并，请检查通知`)
  const result = await response.json()
  if (result.code !== 0 && result.StatusCode !== 0) throw new Error('飞书未确认发送成功；PR 已合并，请检查通知')
  await api('/check-runs', 'POST', {name:'Feishu workbench brief',head_sha:sha,external_id:notificationId,status:'completed',conclusion:'success',output:{title:'工作台简介已发送到飞书',summary:'群机器人确认成功；投稿已合并。'}})
  console.log('已确认投稿合并，飞书群机器人已确认简介发送成功')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await publish() } catch(error) { console.error(error.message);process.exitCode=1 }
}
