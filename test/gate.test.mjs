import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runGate } from '../scripts/trusted-pr-gate.mjs'
import { ROOT } from '../scripts/catalog-lib.mjs'

const sha = 'c'.repeat(40)
const env = { GITHUB_TOKEN: 'test-token', REPOSITORY: 'catalog/repo', CANDIDATE_SHA: sha }
const pull = { number: 3, state: 'open', base: { ref: 'main', repo: { full_name: 'catalog/repo' } }, head: { sha } }
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

function apiMock({ pulls = [pull], files = [], source = '', failure = false } = {}) {
  const reports = []
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push(url)
    if (url.endsWith(`/commits/${sha}/pulls?per_page=100`)) return json(pulls)
    if (url.endsWith('/check-runs') && options.method === 'POST') {
      reports.push(JSON.parse(options.body))
      return json({ id: 12 })
    }
    if (url.endsWith('/check-runs/12')) { reports.push(JSON.parse(options.body)); return json({}) }
    if (url.includes('/pulls/3/files?')) return json(files)
    if (url.includes('/contents/')) return new Response(source)
    if (failure) return new Response('', { status: 503 })
    throw new Error(`unexpected request: ${url}`)
  }
  return { fetchImpl, reports, calls }
}

test('maintenance succeeds without fetching or running any PR code', async () => {
  const mock = apiMock({ files: [{ filename: 'scripts/tool.mjs', status: 'modified' }] })
  assert.equal((await runGate({ env, ...mock })).failed, false)
  assert.equal(mock.reports.at(-1).conclusion, 'success')
  assert.ok(!mock.calls.some((url) => url.includes('/contents/')))
})

test('stale head never reports success on a newer submission', async () => {
  const mock = apiMock({ pulls: [{ ...pull, head: { sha: 'd'.repeat(40) } }] })
  await runGate({ env, ...mock })
  assert.equal(mock.reports.length, 0)
})

test('mixed and malformed submissions receive explicit failure on original head', async () => {
  for (const files of [
    [{ filename: 'data/workbenches/owner__repo.yml', status: 'added' }, { filename: 'README.md', status: 'modified' }],
    [{ filename: 'data/workbenches/owner__repo.yml', status: 'added' }]
  ]) {
    const mock = apiMock({ files, source: 'not: [valid' })
    assert.equal((await runGate({ env, ...mock })).failed, true)
    assert.equal(mock.reports[0].head_sha, sha)
    assert.equal(mock.reports.at(-1).conclusion, 'failure')
  }
})

test('network incomplete is blocking failure, never neutral', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gate-empty-'))
  try {
    const source = await fs.readFile(path.join(ROOT, 'test/fixtures/valid/owner__repo.yml'), 'utf8')
    const mock = apiMock({ files: [{ filename: 'data/workbenches/owner__repo.yml', status: 'added' }], source, failure: true })
    assert.equal((await runGate({ env, ...mock, dataDir: directory })).failed, true)
    assert.equal(mock.reports.at(-1).conclusion, 'failure')
    assert.match(mock.reports.at(-1).output.summary, /暂未完成/)
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
