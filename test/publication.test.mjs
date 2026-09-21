import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { ROOT } from '../scripts/catalog-lib.mjs'
import { generatePreview } from '../scripts/generate-catalog.mjs'
import { probeCatalog } from '../scripts/probe-catalog.mjs'
import { publishMetadata } from '../scripts/publication.mjs'

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-publication-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'data/workbenches'), { recursive: true })
  await fs.copyFile(path.join(ROOT, 'data/categories.json'), path.join(root, 'data/categories.json'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial')
  return { root, sha: git('rev-parse', 'HEAD') }
}

test('preview never overwrites a published catalog or its checksum; input changes update preview', async (t) => {
  const { root, sha } = await workspace(t)
  await probeCatalog({ root })
  await publishMetadata(root)
  const names = ['catalog.json', 'catalog.sha256', 'publication.json']
  const before = await Promise.all(names.map(name => fs.readFile(path.join(root, 'dist', name), 'utf8')))
  const hash = crypto.createHash('sha256').update(before[0]).digest('hex')
  assert.equal(before[1], `${hash}  catalog.json\n`)
  assert.deepEqual(JSON.parse(before[2]), { schemaVersion: 1, sourceCommit: sha, sha256: hash, entries: 0 })
  await generatePreview(root)
  const previewPath = path.join(root, '.cache/catalog-preview.json')
  assert.equal(JSON.parse(await fs.readFile(previewPath)).kind, 'preview')
  const candidate = path.join(root, 'data/workbenches/owner__repo.yml')
  await fs.copyFile(path.join(ROOT, 'test/fixtures/valid/owner__repo.yml'), candidate)
  await generatePreview(root)
  const preview = await fs.readFile(previewPath, 'utf8')
  assert.equal(JSON.parse(preview).workbenches[0].name, '项目助手')
  await generatePreview(root)
  assert.equal(await fs.readFile(previewPath, 'utf8'), preview)
  await assert.rejects(() => probeCatalog({ root, fetchImpl: async () => new Response('', { status: 503 }) }), /探测失败/)
  assert.deepEqual(await Promise.all(names.map(name => fs.readFile(path.join(root, 'dist', name), 'utf8'))), before)
})

test('publication rejects preview and malformed catalog without replacing metadata', async (t) => {
  const { root } = await workspace(t)
  await probeCatalog({ root })
  await publishMetadata(root)
  const original = await fs.readFile(path.join(root, 'dist/publication.json'), 'utf8')
  for (const content of ['{"kind":"preview","schemaVersion":1,"categories":[],"workbenches":[]}', '{}', 'broken JSON']) {
    await fs.writeFile(path.join(root, 'dist/catalog.json'), content)
    await assert.rejects(() => publishMetadata(root))
    assert.equal(await fs.readFile(path.join(root, 'dist/publication.json'), 'utf8'), original)
  }
})
