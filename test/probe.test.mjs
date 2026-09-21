import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import * as tar from 'tar'
import sharp from 'sharp'
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
  repository: 'https://github.com/owner/repo.git',
  dsh: { client: { inject: ['dsh-desktop-workbenches'] }, bundle: { patch: 'cordis.patch.yml' } }
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const record = (release) => ({
  owner: 'owner',
  repository: 'repo',
  entry: {
    url: 'https://github.com/owner/repo',
    source: { commit: 'a'.repeat(40) },
    workbenchId: 'sample-workbench',
    version: '1.2.3',
    screenshots: [{ path: 'screenshots/main.png', alt: 'Main' }],
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
  await fs.writeFile(path.join(root, 'cordis.patch.yml'), '- insert: []')
  const output = path.join(directory, 'release.tgz')
  await tar.c({ gzip: true, cwd: directory, file: output }, ['package'])
  const bytes = await fs.readFile(output)
  await fs.rm(directory, { recursive: true, force: true })
  return bytes
}

function successfulFetch({ archive, repo = {}, manifestValue = manifest } = {}) {
  return async (url) => {
    if (url === 'https://api.github.com/repos/owner/repo') return json({ private: false, archived: false, default_branch: 'main', license: { spdx_id: 'MIT' }, ...repo })
    if (url.includes('/commits/')) return json({ sha: 'a'.repeat(40) })
    if (url.endsWith('/workbench.json')) return json(manifestValue)
    if (url.endsWith('/package.json')) return json(pkg)
    if (url.endsWith('/client.js') || url.endsWith('/cordis.patch.yml')) return new Response('source')
    if (url.endsWith('/main.png')) return new Response(await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer())
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
    if (url.includes('/commits/')) return json({ sha: 'a'.repeat(40) })
    if (url.endsWith('/workbench.json')) return json(manifest)
    if (url.endsWith('/package.json')) return json(mismatched)
    if (url.startsWith('https://registry.npmjs.org/')) throw new Error(`npm must not be queried: ${url}`)
    return successfulFetch()(url)
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

test('never follows the default branch after approval', async () => {
  const seen = []
  const fallback = successfulFetch()
  await probeEntry(record(), { fetchImpl: (url) => { seen.push(url); return fallback(url) } })
  assert.ok(seen.includes(`https://api.github.com/repos/owner/repo/commits/${'a'.repeat(40)}`))
  assert.ok(!seen.some((url) => url.includes('/commits/main')))
})

test('rejects version drift and missing installable plugin declarations', async () => {
  await assert.rejects(() => probeEntry({ ...record(), entry: { ...record().entry, version: '2.0.0' } }, { fetchImpl: successfulFetch() }), /version/)
  const fallback = successfulFetch()
  await assert.rejects(() => probeEntry(record(), { fetchImpl: (url) => url.endsWith('/package.json') ? json({ ...pkg, dsh: {} }) : fallback(url) }), /bundle.patch/)
})

test('market images come only from YAML and must exist and decode', async () => {
  const fallback = successfulFetch({ manifestValue: { ...manifest, screenshots: ['ignored.png'] } })
  const good = await probeEntry(record(), { fetchImpl: fallback })
  assert.equal(good.screenshots.length, 1)
  assert.equal(good.screenshots[0].width, 2)
  for (const response of [new Response('', { status: 404 }), new Response('<html>not a picture</html>')]) {
    await assert.rejects(() => probeEntry(record(), { fetchImpl: (url) => url.endsWith('/main.png') ? response : fallback(url) }), (error) => error.code === 'invalid-image')
  }
})

test('accepts the host conventional ./ prefix for package paths', async () => {
  const fallback = successfulFetch({ manifestValue: { ...manifest, entry: './client.js' } })
  const result = await probeEntry(record(), { fetchImpl: (url) => url.endsWith('/package.json')
    ? json({ ...pkg, dsh: { ...pkg.dsh, bundle: { patch: './cordis.patch.yml' } } })
    : fallback(url) })
  assert.equal(result.workbenchId, manifest.id)
})

test('rejects release downloads over the 8 MiB limit as a definite failure', async () => {
  const fallback = successfulFetch()
  await assert.rejects(() => probeEntry(record({ url: 'https://github.com/owner/repo/releases/download/v1.2.3/workbench.tgz', sha256: '0'.repeat(64) }), {
    fetchImpl: (url) => url.endsWith('.tgz') ? new Response('x', { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }) : fallback(url)
  }), (error) => error.code === 'release-invalid' && !error.incomplete)
})
