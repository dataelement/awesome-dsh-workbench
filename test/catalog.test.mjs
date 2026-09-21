import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createValidator, generateCatalog, readEntry, ROOT } from '../scripts/catalog-lib.mjs'

const fixture = path.join(ROOT, 'test/fixtures/valid/owner__repo.yml')

test('minimal example is the production protocol, with no duplicated runtime or review fields', async () => {
  const record = await readEntry(fixture, await createValidator())
  const example = await readEntry(path.join(ROOT, 'examples/workbench.yml'), await createValidator(), { example: true })
  assert.deepEqual(record, example)
  assert.deepEqual(Object.keys(record.entry), ['url', 'category', 'screenshots'])
  const catalog = generateCatalog([record], [])
  assert.equal(catalog.workbenches[0].id, 'owner/repo')
  assert.equal(catalog.workbenches[0].distribution, undefined) // Only a successful probe chooses an install target.
})

test('rejects redundant author fields', async () => {
  const validate = await createValidator()
  const { entry } = await readEntry(fixture, validate)
  for (const key of ['id', 'workbenchId', 'schemaVersion', 'version', 'source', 'author', 'verification', 'requirements', 'npm', 'name', 'description', 'release']) {
    assert.equal(validate({ ...entry, [key]: 'not-author-settable' }), false, key)
  }
})

test('filename must match the repository', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-catalog-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'someone__else.yml')
  await fs.copyFile(fixture, file)
  const validate = await createValidator()
  await assert.rejects(() => readEntry(file, validate), /文件名/)
})

test('rejects unsafe, duplicate and oversized screenshot lists', async (t) => {
  const validate = await createValidator()
  const { entry } = await readEntry(fixture, validate)
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-paths-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'owner__repo.yml')
  for (const imagePath of ['../x.png', '/x.png', 'C:/x.png', 'a\\b.png', 'https://example.com/x.png', '%2e%2e/x.png']) {
    await fs.writeFile(file, JSON.stringify({ ...entry, screenshots: [imagePath] }))
    await assert.rejects(() => readEntry(file, validate), /安全/)
  }
  for (const screenshots of [[], ['a.png', 'a.png'], Array.from({ length: 6 }, (_, i) => `${i}.png`)]) assert.equal(validate({ ...entry, screenshots }), false)
})

test('catalog uniqueness key derives from GitHub owner/repository, sorted deterministically', async () => {
  const { entry } = await readEntry(fixture, await createValidator())
  const make = (owner) => ({ owner, repository: 'Repo', entry: { ...entry, url: `https://github.com/${owner}/Repo` } })
  assert.equal(generateCatalog([make('Owner')], []).workbenches[0].id, 'owner/repo')
  assert.deepEqual(generateCatalog([make('zeta'), make('alpha')], []), generateCatalog([make('alpha'), make('zeta')], []))
})
