import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createValidator, generateCatalog, readEntry, ROOT } from '../scripts/catalog-lib.mjs'

const fixture = path.join(ROOT, 'test/fixtures/valid/owner__repo.yml')

test('accepts the documented YAML and derives generated fields', async () => {
  const record = await readEntry(fixture, await createValidator())
  const catalog = generateCatalog([record], [{ id: 'productivity', name: { zh: '效率' } }])
  const item = catalog.workbenches[0]
  assert.equal(item.id, 'owner/repo')
  assert.equal(item.workbenchId, 'sample-workbench')
  assert.equal(item.sourceCommit, 'a'.repeat(40))
  assert.equal(item.version, '1.2.3')
  assert.equal(item.screenshots[0].url, `https://raw.githubusercontent.com/owner/repo/${'a'.repeat(40)}/docs/images/overview.webp`)
  assert.equal(item.distribution.type, 'github-release')
  assert.equal(item.distribution.sha256, 'a'.repeat(64))
})

test('keeps the agreed seven categories', async () => {
  const categories = JSON.parse(await fs.readFile(path.join(ROOT, 'data/categories.json'), 'utf8'))
  assert.deepEqual(categories.map(({ id }) => id), [
    'development',
    'productivity',
    'content',
    'data',
    'research',
    'operations',
    'other'
  ])
})

test('rejects unknown author fields', async () => {
  const validate = await createValidator()
  const { entry } = await readEntry(fixture, validate)
  assert.equal(validate({ ...entry, id: 'not-author-settable' }), false)
  assert.ok(validate.errors.some((error) => error.keyword === 'additionalProperties'))
})

test('rejects a filename that does not match the repository', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-catalog-'))
  const wrongFile = path.join(directory, 'someone__else.yml')
  await fs.copyFile(fixture, wrongFile)
  const validate = await createValidator()
  await assert.rejects(() => readEntry(wrongFile, validate), /文件名应为 owner__repo.yml/)
})

test('rejects a release asset from another repository', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-catalog-'))
  const file = path.join(directory, 'owner__repo.yml')
  const contents = (await fs.readFile(fixture, 'utf8')).replace(
    'github.com/owner/repo/releases',
    'github.com/another/repo/releases'
  )
  await fs.writeFile(file, contents)
  const validate = await createValidator()
  await assert.rejects(() => readEntry(file, validate), /必须属于同一个 GitHub 仓库/)
})

test('rejects a movable latest release URL', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-catalog-'))
  const file = path.join(directory, 'owner__repo.yml')
  const contents = (await fs.readFile(fixture, 'utf8')).replace('/download/v1.2.3/', '/download/latest/')
  await fs.writeFile(file, contents)
  const validate = await createValidator()
  await assert.rejects(() => readEntry(file, validate), /不能使用 latest/)
})

test('catalog generation is stable regardless of input order', () => {
  const make = (owner) => ({
    owner,
    repository: 'repo',
    entry: {
      source: { commit: 'a'.repeat(40) },
      screenshots: [],
      url: `https://github.com/${owner}/repo`,
      name: owner,
      category: 'other',
      description: { zh: `${owner} 的工作台描述内容足够长。` }
    }
  })
  const categories = [{ id: 'other', name: { zh: '其他' } }]
  assert.deepEqual(generateCatalog([make('zeta'), make('alpha')], categories), generateCatalog([make('alpha'), make('zeta')], categories))
})

test('example is validated using the production schema', async () => {
  const record = await readEntry(path.join(ROOT, 'examples/workbench.yml'), await createValidator(), { example: true })
  assert.equal(record.entry.workbenchId, 'sample-workbench')
})

test('rejects unsafe or duplicate screenshot paths and movable commits', async () => {
  const validate = await createValidator()
  const { entry } = await readEntry(fixture, validate)
  for (const commit of ['main', 'v1.2.3', 'abc123']) assert.equal(validate({ ...entry, source: { commit } }), false)
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-paths-'))
  try {
    const file = path.join(directory, 'owner__repo.yml')
    for (const imagePath of ['../x.png', '/x.png', 'C:/x.png', 'a\\b.png', 'https://example.com/x.png', '%2e%2e/x.png']) {
      await fs.writeFile(file, JSON.stringify({ ...entry, screenshots: [{ path: imagePath, alt: 'test' }] }))
      await assert.rejects(() => readEntry(file, validate), /安全/)
    }
    await fs.writeFile(file, JSON.stringify({ ...entry, screenshots: [{ path: 'a.png', alt: 'a' }, { path: 'a.png', alt: 'b' }] }))
    await assert.rejects(() => readEntry(file, validate), /重复/)
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
