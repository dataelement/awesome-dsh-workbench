import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import yaml from 'js-yaml'
import semver from 'semver'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = path.join(ROOT, 'data/workbenches')

function formatAjvErrors(errors = []) {
  return errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
}

export async function createValidator() {
  const schema = JSON.parse(await fs.readFile(path.join(ROOT, 'schema/workbench.schema.json'), 'utf8'))
  const categories = JSON.parse(await fs.readFile(path.join(ROOT, 'data/categories.json'), 'utf8'))
  const categoryIds = categories.map(({ id }) => id)
  const schemaIds = schema.properties.category.enum
  if (JSON.stringify(categoryIds) !== JSON.stringify(schemaIds)) {
    throw new Error('data/categories.json 与 schema 中的 category 枚举不一致')
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  return ajv.compile(schema)
}

export function repositoryParts(url) {
  const parsed = new URL(url)
  const [owner, repository, extra] = parsed.pathname.replace(/^\//, '').replace(/\/$/, '').split('/')
  if (extra || !owner || !repository) throw new Error(`仓库地址格式无效：${url}`)
  return { owner, repository }
}

export function safeRelativePath(value, { allowDotPrefix = false } = {}) {
  if (allowDotPrefix && typeof value === 'string') value = value.replace(/^\.\//, '')
  return typeof value === 'string' && value.length <= 500 && !/[\\:%?#\x00-\x1f]/.test(value)
    && value.split('/').every((part) => part && part !== '.' && part !== '..')
}

export async function readEntry(file, validate, { example = false } = {}) {
  const relative = path.relative(ROOT, file)
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${relative} 必须是普通文件`)
  let entry
  try {
    const source = await fs.readFile(file, 'utf8')
    if (Buffer.byteLength(source) > 32 * 1024) throw new Error('文件不能超过 32 KB')
    entry = yaml.load(source, { json: false, schema: yaml.JSON_SCHEMA, maxAliasCount: 20 })
  } catch (error) {
    throw new Error(`${relative} 不是有效 YAML：${error.message}`)
  }
  if (!validate(entry)) throw new Error(`${relative} 不符合 schema：${formatAjvErrors(validate.errors)}`)

  const { owner, repository } = repositoryParts(entry.url)
  if (repository.toLowerCase().endsWith('.git')) throw new Error(`${relative} 的 url 请使用仓库主页，不要以 .git 结尾`)
  const expected = `${owner}__${repository}.yml`.toLowerCase()
  if (!example && path.basename(file).toLowerCase() !== expected) {
    throw new Error(`${relative} 文件名应为 ${owner}__${repository}.yml`)
  }
  if (semver.valid(entry.version) !== entry.version || semver.valid(entry.verification.desktopVersion) !== entry.verification.desktopVersion) throw new Error(`${relative} 的 version 和 desktopVersion 必须是完整 SemVer`)
  const images = new Set()
  for (const image of entry.screenshots) {
    if (!safeRelativePath(image.path) || !/\.(png|jpe?g|webp)$/i.test(image.path)) throw new Error(`${relative} 的截图必须是安全的相对 PNG/JPEG/WebP 路径`)
    if (images.has(image.path)) throw new Error(`${relative} 的截图路径重复`)
    images.add(image.path)
  }
  if (entry.release) {
    const release = new URL(entry.release.url)
    const releasePrefix = `/${owner}/${repository}/releases/download/`.toLowerCase()
    if (!release.pathname.toLowerCase().startsWith(releasePrefix)) {
      throw new Error(`${relative} 的 release.url 必须属于同一个 GitHub 仓库`)
    }
    const releaseTail = release.pathname.slice(releasePrefix.length)
    if (releaseTail.toLowerCase().startsWith('latest/')) {
      throw new Error(`${relative} 的 release.url 必须使用固定版本，不能使用 latest`)
    }
  }
  return { entry, owner, repository }
}

export async function loadEntries({ directory = DATA_DIR } = {}) {
  const validate = await createValidator()
  const names = (await fs.readdir(directory)).filter((name) => !name.startsWith('.')).sort()
  const invalid = names.filter((name) => !/^[A-Za-z0-9_.-]+__[A-Za-z0-9_.-]+\.yml$/.test(name))
  if (invalid.length) throw new Error(`data/workbenches 只允许 owner__repo.yml：${invalid.join(', ')}`)
  const records = []
  for (const name of names) records.push(await readEntry(path.join(directory, name), validate))
  const workbenchIds = new Set()
  const ids = new Set()
  for (const { entry, owner, repository } of records) {
    if (workbenchIds.has(entry.workbenchId)) throw new Error(`工作台 ID 重复：${entry.workbenchId}`)
    workbenchIds.add(entry.workbenchId)
    const id = `${owner}/${repository}`.toLowerCase()
    if (ids.has(id)) throw new Error(`仓库重复：${id}`)
    ids.add(id)
  }
  return records
}

export function generateCatalog(records, categories) {
  return {
    schemaVersion: 1,
    categories,
    workbenches: records
      .map(({ entry, owner, repository }) => ({
        id: `${owner}/${repository}`.toLowerCase(),
        owner,
        repository,
        url: entry.url.replace(/\/$/, ''),
        name: entry.name,
        workbenchId: entry.workbenchId,
        author: entry.author,
        version: entry.version,
        sourceCommit: entry.source.commit,
        verification: entry.verification,
        requirements: entry.requirements,
        screenshots: entry.screenshots.map(({ path: imagePath, alt }) => ({
          url: `https://raw.githubusercontent.com/${owner}/${repository}/${entry.source.commit}/${imagePath.split('/').map(encodeURIComponent).join('/')}`,
          alt
        })),
        category: entry.category,
        description: entry.description,
        distribution: entry.release
          ? { type: 'github-release', url: entry.release.url, sha256: entry.release.sha256 }
          : { type: 'github-source', url: entry.url.replace(/\/$/, ''), commit: entry.source.commit }
      }))
      .sort((a, b) => a.id.localeCompare(b.id, 'en'))
  }
}
