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
  assert.deepEqual(catalog.workbenches[0], {
    id: 'owner/repo',
    owner: 'owner',
    repository: 'repo',
    url: 'https://github.com/owner/repo',
    name: '示例工作台',
    category: 'productivity',
    description: { zh: '用来验证目录工具的示例工作台，不代表市场已收录。' },
    distribution: {
      type: 'github-release',
      url: 'https://github.com/owner/repo/releases/download/v1.0.0/workbench.tgz',
      sha256: 'a'.repeat(64)
    }
  })
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
  assert.equal(validate({
    url: 'https://github.com/owner/repo',
    name: '示例工作台',
    category: 'other',
    description: { zh: '这是满足最小长度要求的中文描述。' },
    id: 'author-must-not-set-this'
  }), false)
  assert.match(validate.errors[0].message, /additional properties/)
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
  const contents = (await fs.readFile(fixture, 'utf8')).replace('/download/v1.0.0/', '/download/latest/')
  await fs.writeFile(file, contents)
  const validate = await createValidator()
  await assert.rejects(() => readEntry(file, validate), /不能使用 latest/)
})

test('catalog generation is stable regardless of input order', () => {
  const make = (owner) => ({
    owner,
    repository: 'repo',
    entry: {
      url: `https://github.com/${owner}/repo`,
      name: owner,
      category: 'other',
      description: { zh: `${owner} 的工作台描述内容足够长。` }
    }
  })
  const categories = [{ id: 'other', name: { zh: '其他' } }]
  assert.deepEqual(generateCatalog([make('zeta'), make('alpha')], categories), generateCatalog([make('alpha'), make('zeta')], categories))
})
