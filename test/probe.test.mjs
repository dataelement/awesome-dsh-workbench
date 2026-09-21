import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import * as tar from 'tar'
import { probeAll, probeEntry, ProbeError } from '../scripts/probe-lib.mjs'

const manifest = {
  schemaVersion: 1,
  id: 'sample-workbench',
  title: 'Sample',
  description: 'Sample workbench',
  version: '1.2.3',
  entry: 'client.js',
  compatibility: { desktopWorkbenches: '^1.0.0', harness: '^1.0.0' },
  capabilities: [],
  screenshots: ['screenshots/main.png']
}
const pkg = {
  name: '@owner/sample-workbench',
  version: '1.2.3',
  repository: 'https://github.com/owner/repo.git'
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const record = (release) => ({
  owner: 'owner',
  repository: 'repo',
  entry: {
    url: 'https://github.com/owner/repo',
    name: 'Sample',
    category: 'other',
    description: { zh: '这是一个长度足够的测试工作台说明。' },
    ...(release ? { release } : {})
  }
})

async function releaseArchive() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-probe-test-'))
  const root = path.join(directory, 'package')
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, 'workbench.json'), JSON.stringify(manifest))
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg))
  await fs.writeFile(path.join(root, 'client.js'), '')
  const output = path.join(directory, 'release.tgz')
  await tar.c({ gzip: true, cwd: directory, file: output }, ['package'])
  return fs.readFile(output)
}

function successfulFetch({ archive, repo = {}, manifestValue = manifest } = {}) {
  return async (url) => {
    if (url === 'https://api.github.com/repos/owner/repo') return json({ private: false, archived: false, default_branch: 'main', license: { spdx_id: 'MIT' }, ...repo })
    if (url.includes('/commits/main')) return json({ sha: 'a'.repeat(40) })
    if (url.endsWith('/workbench.json')) return json(manifestValue)
    if (url.endsWith('/package.json')) return json(pkg)
    if (url.startsWith('https://registry.npmjs.org/')) return json({
      repository: { url: 'git+https://github.com/owner/repo.git' },
      versions: { '1.2.3': { repository: { url: 'git+https://github.com/owner/repo.git' } } }
    })
    if (url === 'https://github.com/owner/repo/releases/download/v1.2.3/workbench.tgz') return new Response(archive, { status: 200, headers: { 'content-length': String(archive.length) } })
    return new Response('', { status: 404 })
  }
}

test('probes a public licensed repository, npm metadata and inert release archive', async () => {
  const archive = await releaseArchive()
  const release = {
    url: 'https://github.com/owner/repo/releases/download/v1.2.3/workbench.tgz',
    sha256: crypto.createHash('sha256').update(archive).digest('hex')
  }
  const result = await probeEntry(record(release), { fetchImpl: successfulFetch({ archive }) })
  assert.equal(result.workbenchId, 'sample-workbench')
  assert.equal(result.version, '1.2.3')
  assert.equal(result.sourceCommit, 'a'.repeat(40))
  assert.deepEqual(result.npmPackage, { name: '@owner/sample-workbench', version: '1.2.3' })
  assert.match(result.screenshots[0].url, /\/a{40}\/screenshots\/main\.png$/)
  assert.equal(result.release.sha256, release.sha256)
  assert.deepEqual(result.probe, { status: 'ok' })
})

test('marks unavailable and rate-limited GitHub responses incomplete', async () => {
  for (const status of [503, 403, 429]) {
    await assert.rejects(
      () => probeEntry(record(), { fetchImpl: async () => new Response('', { status }) }),
      (error) => error instanceof ProbeError && error.incomplete
    )
  }
})

test('rejects archived repositories and repositories without a detected license', async () => {
  await assert.rejects(() => probeEntry(record(), { fetchImpl: successfulFetch({ repo: { archived: true } }) }), /已归档/)
  await assert.rejects(() => probeEntry(record(), { fetchImpl: successfulFetch({ repo: { license: null } }) }), /许可证/)
})

test('rejects an invalid remote workbench manifest', async () => {
  await assert.rejects(
    () => probeEntry(record(), { fetchImpl: successfulFetch({ manifestValue: { schemaVersion: 1, id: 'INVALID' } }) }),
    (error) => error instanceof ProbeError && error.code === 'invalid-manifest'
  )
})

test('rejects a release whose checksum does not match', async () => {
  const archive = await releaseArchive()
  const release = { url: 'https://github.com/owner/repo/releases/download/v1.2.3/workbench.tgz', sha256: '0'.repeat(64) }
  await assert.rejects(
    () => probeEntry(record(release), { fetchImpl: successfulFetch({ archive }) }),
    (error) => error instanceof ProbeError && error.code === 'release-mismatch'
  )
})

test('never guesses npm when repository metadata does not map back', async () => {
  const mismatched = { ...pkg, repository: 'https://github.com/someone/else' }
  const fetchImpl = async (url) => {
    if (url === 'https://api.github.com/repos/owner/repo') return json({ private: false, archived: false, default_branch: 'main', license: { spdx_id: 'MIT' } })
    if (url.includes('/commits/main')) return json({ sha: 'b'.repeat(40) })
    if (url.endsWith('/workbench.json')) return json(manifest)
    if (url.endsWith('/package.json')) return json(mismatched)
    throw new Error(`npm must not be queried: ${url}`)
  }
  assert.equal((await probeEntry(record(), { fetchImpl })).npmPackage, null)
})

test('rejects duplicate workbench IDs across catalog entries', async () => {
  const second = { ...record(), owner: 'second', repository: 'repo', entry: { ...record().entry, url: 'https://github.com/second/repo' } }
  const fetchImpl = async (url) => {
    const rewritten = url.replace('/second/repo', '/owner/repo')
    return successfulFetch()(rewritten)
  }
  const results = await probeAll([record(), second], { fetchImpl })
  assert.equal(results[1].error.code, 'duplicate-workbench-id')
})
