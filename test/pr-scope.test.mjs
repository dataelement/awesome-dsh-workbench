import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ROOT } from '../scripts/catalog-lib.mjs'

const script = path.join(ROOT, 'scripts/validate-pr.mjs')

async function repository() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-pr-'))
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  await fs.writeFile(path.join(directory, 'README.md'), 'base\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  return { directory, git, base: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim() }
}

test('allows exactly one catalog YAML change', async () => {
  const { directory, git, base } = await repository()
  await fs.mkdir(path.join(directory, 'data/workbenches'), { recursive: true })
  await fs.writeFile(path.join(directory, 'data/workbenches/owner__repo.yml'), 'entry\n')
  git('add', '.')
  git('commit', '-qm', 'entry')
  const result = spawnSync(process.execPath, [script, base, 'HEAD'], { cwd: directory, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('rejects generated index changes beside one YAML', async () => {
  const { directory, git, base } = await repository()
  await fs.mkdir(path.join(directory, 'data/workbenches'), { recursive: true })
  await fs.writeFile(path.join(directory, 'data/workbenches/owner__repo.yml'), 'entry\n')
  await fs.writeFile(path.join(directory, 'data/index.json'), '{}\n')
  git('add', '.')
  git('commit', '-qm', 'entry and catalog')
  const result = spawnSync(process.execPath, [script, base, 'HEAD'], { cwd: directory, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /不能提交生成索引/)
})

test('rejects catalog data mixed with unrelated changes', async () => {
  const { directory, git, base } = await repository()
  await fs.mkdir(path.join(directory, 'data/workbenches'), { recursive: true })
  await fs.writeFile(path.join(directory, 'data/workbenches/owner__repo.yml'), 'entry\n')
  await fs.writeFile(path.join(directory, 'README.md'), 'changed\n')
  git('add', '.')
  git('commit', '-qm', 'mixed')
  const result = spawnSync(process.execPath, [script, base, 'HEAD'], { cwd: directory, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /不能混入/)
})

test('separates maintenance, removal, and submission scope', async () => {
  const { classifyChanges } = await import('../scripts/pr-policy.mjs')
  assert.equal(classifyChanges([{ filename: 'scripts/tool.mjs', status: 'modified' }]).type, 'maintenance')
  assert.equal(classifyChanges([{ filename: 'data/workbenches/owner__repo.yml', status: 'removed' }]).type, 'removal')
  assert.throws(() => classifyChanges([{ filename: 'README.md', previous_filename: 'data/workbenches/owner__repo.yml', status: 'renamed' }]), /路径/)
  assert.throws(() => classifyChanges([{ filename: 'data/workbenches/owner__repo.json', status: 'added' }]), /路径/)
})

test('rejects generated-only and renamed output while allowing cleanup', async () => {
  const { classifyChanges } = await import('../scripts/pr-policy.mjs')
  for (const filename of ['data/index.json', 'dist/catalog.json', '.cache/catalog-preview.json']) {
    for (const status of ['added', 'modified', 'renamed']) {
      assert.throws(() => classifyChanges([{ filename, status, previous_filename: 'README.md' }]), /不能提交生成索引/)
    }
    assert.equal(classifyChanges([{ filename, status: 'removed' }]).type, 'maintenance')
  }
})
