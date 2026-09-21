import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ROOT } from '../scripts/catalog-lib.mjs'
import { probeCatalog } from '../scripts/probe-catalog.mjs'

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-index-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'data/workbenches'), { recursive: true })
  await fs.copyFile(path.join(ROOT, 'data/categories.json'), path.join(root, 'data/categories.json'))
  return root
}

test('probe writes the client index under data', async (t) => {
  const root = await workspace(t)
  await probeCatalog({ root })
  const index = JSON.parse(await fs.readFile(path.join(root, 'data/index.json'), 'utf8'))
  assert.equal(index.kind, 'catalog')
  assert.deepEqual(index.workbenches, [])
})

test('a failed probe leaves the previous client index unchanged', async (t) => {
  const root = await workspace(t)
  const indexPath = path.join(root, 'data/index.json')
  await fs.writeFile(indexPath, '{"previous":true}\n')
  await fs.copyFile(
    path.join(ROOT, 'test/fixtures/valid/owner__repo.yml'),
    path.join(root, 'data/workbenches/owner__repo.yml'),
  )
  await assert.rejects(
    () => probeCatalog({ root, fetchImpl: async () => new Response('', { status: 503 }) }),
    /探测失败/,
  )
  assert.equal(await fs.readFile(indexPath, 'utf8'), '{"previous":true}\n')
})
