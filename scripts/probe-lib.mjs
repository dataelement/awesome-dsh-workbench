import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as tar from 'tar'

export class ProbeError extends Error {
  constructor(code, message, { incomplete = false } = {}) {
    super(message)
    this.code = code
    this.incomplete = incomplete
  }
}

async function responseJson(response, label) {
  if (response.status === 403 || response.status === 429) throw new ProbeError('rate-limited', `${label} 遇到 GitHub 限流`, { incomplete: true })
  if (!response.ok) throw new ProbeError('unavailable', `${label} 请求失败（HTTP ${response.status}）`, { incomplete: response.status >= 500 })
  return response.json()
}

function sameRepository(value, owner, repository) {
  const raw = typeof value === 'string' ? value : value?.url
  if (typeof raw !== 'string') return false
  const normalized = raw.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '').replace(/\/$/, '').toLowerCase()
  return normalized === `https://github.com/${owner}/${repository}`.toLowerCase()
}

export function validateManifest(manifest, pkg) {
  const errors = []
  if (manifest?.schemaVersion !== 1) errors.push('schemaVersion 必须为 1')
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(manifest?.id || '')) errors.push('id 无效')
  for (const field of ['title', 'description', 'version', 'entry']) {
    if (typeof manifest?.[field] !== 'string' || !manifest[field].trim()) errors.push(`缺少 ${field}`)
  }
  if (pkg && manifest?.version !== pkg.version) errors.push('workbench.json 与 package.json 版本不一致')
  if (!manifest?.compatibility?.desktopWorkbenches || !manifest?.compatibility?.harness) errors.push('缺少 compatibility 要求')
  if (!Array.isArray(manifest?.capabilities) || !manifest.capabilities.every((value) => typeof value === 'string')) errors.push('capabilities 必须是字符串数组')
  if (manifest?.screenshots !== undefined) {
    if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length < 1 || manifest.screenshots.length > 5) errors.push('screenshots 必须为 1–5 项')
    else for (const item of manifest.screenshots) {
      const image = typeof item === 'string' ? item : item?.path
      if (typeof image !== 'string' || image.startsWith('/') || image.split(/[\\/]+/).includes('..') || !/\.(png|jpe?g|webp)$/i.test(image)) errors.push('截图必须是安全的相对图片路径')
    }
  }
  if (errors.length) throw new ProbeError('invalid-manifest', errors.join('；'))
  return manifest
}

async function fetchJsonFile(fetchImpl, owner, repository, sha, name, required = true) {
  const response = await fetchImpl(`https://raw.githubusercontent.com/${owner}/${repository}/${sha}/${name}`)
  if (!response.ok) {
    if (!required && response.status === 404) return null
    throw new ProbeError('invalid-manifest', `${name} 不存在或不可读取`)
  }
  try { return JSON.parse(await response.text()) } catch { throw new ProbeError('invalid-manifest', `${name} 不是有效 JSON`) }
}

async function inspectRelease(fetchImpl, release, expectedId, expectedVersion) {
  const response = await fetchImpl(release.url)
  if (!response.ok) throw new ProbeError('release-unavailable', `Release 下载失败（HTTP ${response.status}）`)
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > 16 * 1024 * 1024) throw new ProbeError('release-invalid', 'Release 包超过 16 MB 探测上限')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > 16 * 1024 * 1024) throw new ProbeError('release-invalid', 'Release 包超过 16 MB 探测上限')
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  if (digest !== release.sha256) throw new ProbeError('release-mismatch', 'Release 包 SHA-256 与目录声明不一致')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-release-'))
  const archive = path.join(directory, 'package.tgz')
  const unpacked = path.join(directory, 'unpacked')
  await fs.writeFile(archive, bytes)
  await fs.mkdir(unpacked)
  const names = []
  try {
    let expandedBytes = 0
    await tar.t({ file: archive, onentry: (entry) => {
      names.push(entry.path)
      if (!['File', 'Directory'].includes(entry.type)) throw new Error(`不允许 ${entry.type} 条目`)
      expandedBytes += entry.size || 0
      if (entry.size > 8 * 1024 * 1024 || expandedBytes > 32 * 1024 * 1024 || names.length > 500) throw new Error('解包内容超过安全上限')
    } })
    if (names.some((name) => path.isAbsolute(name) || name.split('/').includes('..'))) throw new Error('包含不安全路径')
    await tar.x({ file: archive, cwd: unpacked, strict: true, preservePaths: false })
    const manifestName = names.find((name) => /(^|\/)workbench\.json$/.test(name))
    if (!manifestName) throw new Error('缺少 workbench.json')
    const root = path.dirname(path.join(unpacked, manifestName))
    const manifest = JSON.parse(await fs.readFile(path.join(unpacked, manifestName), 'utf8'))
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
    validateManifest(manifest, pkg)
    const entry = path.resolve(root, manifest.entry)
    const relative = path.relative(root, entry)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !(await fs.stat(entry).catch(() => null))?.isFile()) {
      throw new ProbeError('release-invalid', 'Release 包中的 entry 不存在或路径不安全')
    }
    if (manifest.id !== expectedId || manifest.version !== expectedVersion) throw new ProbeError('release-mismatch', 'Release 包与仓库 manifest 的 id/version 不一致')
  } catch (error) {
    if (error instanceof ProbeError) throw error
    throw new ProbeError('release-invalid', `Release 包检查失败：${error.message}`)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
  return { sha256: digest, bytes: bytes.length }
}

export async function probeEntry(record, { fetchImpl = fetch } = {}) {
  const { entry, owner, repository } = record
  const repo = await responseJson(await fetchImpl(`https://api.github.com/repos/${owner}/${repository}`), '仓库')
  if (repo.private) throw new ProbeError('unavailable', '仓库不是公开仓库')
  if (repo.archived) throw new ProbeError('archived', '仓库已归档')
  if (!repo.license?.spdx_id || repo.license.spdx_id === 'NOASSERTION') throw new ProbeError('missing-license', '仓库没有可识别的许可证')
  const commit = await responseJson(await fetchImpl(`https://api.github.com/repos/${owner}/${repository}/commits/${encodeURIComponent(repo.default_branch)}`), '默认分支 commit')
  if (!/^[a-f0-9]{40}$/i.test(commit.sha || '')) throw new ProbeError('unavailable', 'GitHub 没有返回完整 source commit')
  const manifest = await fetchJsonFile(fetchImpl, owner, repository, commit.sha, 'workbench.json')
  const pkg = await fetchJsonFile(fetchImpl, owner, repository, commit.sha, 'package.json', false)
  validateManifest(manifest, pkg)

  let npmPackage = null
  if (pkg?.name && sameRepository(pkg.repository, owner, repository)) {
    const npmResponse = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`)
    if (npmResponse.ok) {
      const npm = await npmResponse.json()
      const published = npm.versions?.[pkg.version]
      if (published && sameRepository(npm.repository, owner, repository) && sameRepository(published.repository || npm.repository, owner, repository)) {
        npmPackage = { name: pkg.name, version: pkg.version }
      }
    } else if (npmResponse.status !== 404 && (npmResponse.status === 429 || npmResponse.status >= 500)) {
      throw new ProbeError('npm-incomplete', 'npm 元数据暂时不可用', { incomplete: true })
    }
  }
  const release = entry.release ? await inspectRelease(fetchImpl, entry.release, manifest.id, manifest.version) : null
  return {
    workbenchId: manifest.id,
    version: manifest.version,
    screenshots: (manifest.screenshots || []).map((item) => {
      const imagePath = typeof item === 'string' ? item : item.path
      const encoded = imagePath.split('/').map(encodeURIComponent).join('/')
      return {
        url: `https://raw.githubusercontent.com/${owner}/${repository}/${commit.sha}/${encoded}`,
        ...(typeof item === 'object' && item.alt ? { alt: item.alt } : {})
      }
    }),
    sourceCommit: commit.sha,
    license: repo.license.spdx_id,
    npmPackage,
    release,
    probe: { status: 'ok' }
  }
}

export async function probeAll(records, options = {}) {
  const results = []
  const ids = new Map()
  for (const record of records) {
    try {
      const generated = await probeEntry(record, options)
      const prior = ids.get(generated.workbenchId)
      if (prior) throw new ProbeError('duplicate-workbench-id', `workbenchId ${generated.workbenchId} 与 ${prior} 重复`)
      ids.set(generated.workbenchId, `${record.owner}/${record.repository}`)
      results.push({ record, generated })
    } catch (error) {
      const failure = error instanceof ProbeError ? error : new ProbeError('probe-error', error.message, { incomplete: true })
      results.push({ record, error: { code: failure.code, message: failure.message, status: failure.incomplete ? 'incomplete' : 'failed' } })
    }
  }
  return results
}
