#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runGate } from './trusted-pr-gate.mjs'
import { reviewSubmission, MODEL } from './llm-review.mjs'

import { MAX_PACKAGE_BYTES } from './media-lib.mjs'

const packageLimit = `${MAX_PACKAGE_BYTES / 1024 / 1024} MiB`

export const CHECK_NAME = 'Workbench security review'
const escape = (value) => String(value).replace(/[<>&`]/g, ' ').replace(/@/g, '＠')

export const CRITERIA_TITLES = {
  identity: '开源协议与版权归属 (identity)',
  functionality: '功能真实性与完整性 (functionality)',
  package: '安装契约与插件入口 (package)',
  security: '代码与网络安全 (security)',
  data: '数据隐私与凭据安全 (data)',
  ui: '界面边界与交互规范 (ui)',
  workspace: '工作区与路径隔离 (workspace)',
  sessions: '会话生命周期与归属 (sessions)',
  modes: '模式切换与侧栏同步 (modes)',
  disclosure: '权限与外部服务披露 (disclosure)',
  screenshots: '截图与实际功能一致性 (screenshots)'
}

export const CRITERIA_ADVICE = {
  identity: '若工作台内嵌或引用了第三方开源项目（如开源画布、UI 库等），请在包内补充 `THIRD-PARTY-NOTICES.md` 或在 `LICENSE` 文件中完整保留原作者的开源许可证协议与版权声明（保留 `Copyright (c) <年份> <作者>`）。',
  functionality: '请核对条目 YAML 中的中英文描述与实际代码实现是否一致，移除未实际开放的功能宣称，或补齐对应功能的实现代码。',
  package: '请检查 `package.json` 中的 `dsh` 扩展字段（如 `dsh.bundle.patch`、`dsh.client`、`exports`），确保所声明的文件在构建产物中真实存在且入口文件有效。',
  security: '请检查代码中是否存在未经授权的网络外发、高危命令执行或隐蔽通信逻辑，确保所有网络请求和运行行为透明并与声明用途相符。',
  data: '请清理包内所有硬编码的 API Key、Token、私钥或测试凭据，敏感配置需改为由用户在使用时手动配置或通过宿主注入。',
  ui: '参考官方开发规范第 4 节，完善工作台界面边界定义及首次无会话状态下的入口展示。',
  workspace: '请规范工作区目录选择逻辑，遵循平台路径边界规范，避免访问工作区之外的敏感路径。',
  sessions: '请确保会话创建与恢复逻辑符合规范，正确设置 owner 归属，避免干扰其他工作台会话。',
  modes: '请确保工作台模式切换逻辑与侧栏状态保持同步。',
  disclosure: '请在条目描述或 README 中完整如实披露工作台所需的系统权限、外部网络请求或第三方模型/服务依赖。',
  screenshots: '请确保提交的截图清晰展示工作台真实界面，不含凭据或敏感数据，且与声明用途一致。'
}

export function categorizeGateError(rawSummary) {
  const summary = (rawSummary || '').replace(/^安全审核未完成或失败，禁止视为通过。\s*/, '').trim()
  if (/Release 包（上限\s*[\d.]+\s*MiB）\s*超过\s*\d+\s*bytes/i.test(summary)) {
    return {
      reason: '工作台分发包体积超过了平台规定的上限（' + packageLimit + '）。检测到当前条目 YAML 可能未配置独立的 `tarball` 发布包地址，门禁默认拉取了 GitHub 仓库的完整源码包（包含大型测试数据、高分辨率图片等非运行时资源），导致整体体积超出限制。',
      advice: '1. 推荐在工作台仓库的 GitHub Release 中构建并上传轻量化打包的 `.tgz` / `.tar.gz`（仅包含 `package.json`、运行时代码 `dist/` 或 `lib/`、必需资源及开源协议）。\n2. 在 PR 的条目 YAML 中添加 `tarball: <Release 下载直链>`。\n3. 检查并清理仓库中的大文件（如 PDF 文档、未压缩大图、大型数据集等），确保打包体积在 ' + packageLimit + ' 以内。'
    }
  }
  if (/Copilot|MODEL_ERROR|非 JSON|未闭合/i.test(summary)) {
    return {
      reason: `门禁在对工作台源码材料进行自动化模型审查时，因远程模型服务偶发性传输中断或响应异常，审查流程未能正常闭合（技术详情：${escape(summary)}）。`,
      advice: '1. 该问题通常属于外部模型服务的临时网络波动，非投稿代码本身的问题，仓库维护者可重新触发此工作流重试。\n2. 建议检查工作台随包文件是否包含过多非必要的测试套件或构建中间产物（可通过 `.npmignore` 排除），以精简审查材料、提升模型评估稳定性。'
    }
  }
  if (/YAML|条目|schema|filename/i.test(summary)) {
    return {
      reason: `提交的工作台条目文件或 YAML 结构未通过前置规范校验：${escape(summary)}`,
      advice: '1. 请核对条目文件名是否遵循 `<owner>__<repo>.yml` 命名规范。\n2. 对照平台官方规范检查 YAML 必填字段（如 `name`, `version`, `description`, `category` 等）是否完整准确。'
    }
  }
  return {
    reason: escape(summary) || '安全门禁前置检查未通过，请核对提交材料与工作台配置。',
    advice: '1. 请根据上述具体错误原因检查条目配置及远程仓库发布资产。\n2. 修复后直接推送新提交至当前 PR 分支即可重新触发审核。'
  }
}

export function buildReviewComment({ conclusion, report, summary, sha }) {
  if (conclusion === 'success') return null
  const shortSha = sha ? `\`${sha.slice(0, 7)}\`` : ''
  const lines = [
    `### ❌ 工作台安全与规范审查未通过 ${shortSha ? `(${shortSha})` : ''}`,
    '',
    '你好！感谢你为 DSH 工作台生态提交的贡献。在本次自动化安全与规范审查中，门禁检测到部分需要调整的问题，暂未能自动合并。请参考以下详情进行调整：',
    ''
  ]

  const blocking = report?.criteria?.filter((item) => item.status !== 'pass') || []
  if (blocking.length > 0) {
    if (report?.summary) {
      lines.push(`> **审核综述**：${escape(report.summary)}`, '')
    }
    lines.push('#### 📌 问题原因：', '')
    for (const item of blocking) {
      const title = CRITERIA_TITLES[item.id] || item.id
      lines.push(`- **${title}**：${escape(item.reason)}`)
    }
    lines.push('', '#### 💡 解决问题建议：', '')
    for (const item of blocking) {
      const title = CRITERIA_TITLES[item.id] || item.id
      const advice = CRITERIA_ADVICE[item.id] || '请根据上述原因调整代码或配置，确保符合平台开发规范。'
      lines.push(`- **${title}**：${advice}`)
    }
    lines.push('')
  } else {
    const { reason, advice } = categorizeGateError(summary)
    lines.push('#### 📌 问题原因：', '', reason, '', '#### 💡 解决问题建议：', '', advice, '')
  }

  lines.push(
    '---',
    '> 💬 **后续指引**：完成上述调整后，直接将改动推送到当前 PR 分支即可，系统将自动重新执行完整安全门禁。如果在修改过程中有任何疑问，欢迎在评论区随时留言沟通！'
  )
  return lines.join('\n')
}

export async function runSecurityGate({ env = process.env, fetchImpl = fetch, gate = runGate, reviewer = reviewSubmission } = {}) {
  const { REPOSITORY: repository, CANDIDATE_SHA: sha, GITHUB_TOKEN: token, PR_NUMBER: number } = env
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !/^[a-f0-9]{40}$/.test(sha || '') || !/^[1-9]\d*$/.test(number || '') || !token) throw new Error('缺少可信运行上下文')
  const api = async (endpoint, method = 'GET', body) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${endpoint}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) throw new Error(`GitHub 审核 API 返回 ${response.status}`)
    return response.json()
  }
  const current = await api(`/pulls/${number}`)
  if (current.state !== 'open' || current.head?.sha !== sha || current.base?.ref !== 'main' || current.base?.repo?.full_name !== repository) throw new Error('PR 已关闭、无法关联或 head 已更新，审核未完成')
  const check = await api('/check-runs', 'POST', { name: CHECK_NAME, head_sha: sha, status: 'in_progress' })
  let conclusion = 'failure', summary = '审核未完成', report, record
  try {
    const result = await gate({ env, fetchImpl, review: (context) => { record = context.record.entry; return reviewer({ ...context, env }) } })
    const fresh = await api(`/pulls/${number}`)
    if (fresh.state !== 'open' || fresh.head.sha !== sha || (fresh.body || '') !== (current.body || '')) throw new Error('PR 已更新，旧提交结论不能用于当前 head')
    if (result.type === 'submission') {
      report = result.review
      if (!report || typeof report.passed !== 'boolean') throw new Error('缺少 LLM 审核结果')
      conclusion = report.passed ? 'success' : 'failure'
      summary = [
        `模型：${MODEL}；PR head：${sha}；源码：${report.sourceCommit}`,
        `材料 SHA-256：${report.evidenceDigest}；标准 SHA-256：${report.standardsDigest}`,
        `分发：${escape(JSON.stringify(report.distribution))}`,
        escape(report.summary),
        escape(report.limitations || '本次为静态审核，未验证 Desktop 实机运行。'),
        ...report.criteria.map((item) => `- ${item.id}: **${item.status}** — ${escape(item.reason)}（${item.evidence.map((ref) => escape(ref.file) + (ref.startLine ? `:${ref.startLine}-${ref.endLine}` : '')).join(', ')}）`),
        '此结论仅覆盖上述快照；机器审核不证明 Desktop 实测或完整安全审计。全部目录 CI 通过且投稿未变化后，由独立发布步骤自动合并。'
      ].join('\n\n')
    } else {
      conclusion = 'success'
      summary = `${result.type === 'removal' ? '下架' : '仓库维护'} PR，无新增或修改工作台；不调用模型。仍需维护者批准。`
    }
  } catch (error) {
    // Never output API bodies, full source or raw model text.
    console.error('[security-pr-gate error]:', error.message)
    summary = `安全审核未完成或失败，禁止视为通过。${escape(error.message).slice(0, 1000)}`
  }
  await api(`/check-runs/${check.id}`, 'PATCH', { status: 'completed', conclusion,
    output: { title: conclusion === 'success' ? '安全门禁通过；等待目录 CI 与发布确认' : '安全门禁未通过', summary: summary.slice(0, 60000) } })
  if (conclusion !== 'success') {
    try {
      const commentBody = buildReviewComment({ conclusion, report, summary, sha })
      if (commentBody) {
        const comments = await api(`/issues/${number}/comments?per_page=30`).catch(() => [])
        const alreadyCommented = Array.isArray(comments) && comments.some((c) => c.body?.includes(sha.slice(0, 7)))
        if (!alreadyCommented) {
          await api(`/issues/${number}/comments`, 'POST', { body: commentBody })
        }
      }
    } catch (commentError) {
      console.error('[security-pr-gate comment error]:', commentError.message)
    }
  }
  if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  const publish = conclusion === 'success' && report?.passed === true
  if (env.GITHUB_OUTPUT) await fs.appendFile(env.GITHUB_OUTPUT, `publish=${publish}\n`)
  if (publish && env.SECURITY_BRIEF_FILE) await fs.writeFile(env.SECURITY_BRIEF_FILE, JSON.stringify({ repository, number, sha, body: current.body || '', record, evidenceDigest: report.evidenceDigest, model: MODEL }), { mode: 0o600 })
  return { failed: conclusion !== 'success', report, summary }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const res = await runSecurityGate()
    if (res.failed) {
      if (res.summary) console.error(res.summary)
      process.exitCode = 1
    }
  }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
