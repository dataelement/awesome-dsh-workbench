import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import * as tar from 'tar'
import sharp from 'sharp'
import { probeEntry, ProbeError } from '../scripts/probe-lib.mjs'

const manifest = { schemaVersion: 1, id: 'sample-workbench', title: 'Sample', description: 'Sample', version: '2.0.0', entry: './client.js', compatibility: { desktopWorkbenches: '^1.0.0', harness: '^1.0.0' }, capabilities: [] }
const pkg = { name: '@owner/workbench', version: manifest.version, repository: 'https://github.com/owner/repo.git', dsh: { client: { inject: ['dsh-desktop-workbenches'] }, bundle: { patch: './cordis.patch.yml' } } }
const record = (release) => ({ owner: 'owner', repository: 'repo', entry: { url: 'https://github.com/owner/repo', name: 'Sample', category: 'other', description: '这是一个长度足够的工作台说明。', screenshots: ['main.png'], ...(release ? { release } : {}) } })
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const releaseUrl = 'https://github.com/owner/repo/releases/download/v1.2.3/workbench.tgz'
const npmUrl = 'https://registry.npmjs.org/@owner/workbench/-/workbench-1.2.3.tgz'
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => crypto.createHash(algorithm).update(bytes).digest(encoding)

async function archive({ version = '1.2.3', id = manifest.id } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-package-'))
  try {
    const root = path.join(directory, 'package')
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, 'workbench.json'), JSON.stringify({ ...manifest, id, version }))
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ ...pkg, version }))
    await fs.writeFile(path.join(root, 'client.js'), '')
    await fs.writeFile(path.join(root, 'cordis.patch.yml'), '- insert: []')
    const file = path.join(directory, 'package.tgz')
    await tar.c({ gzip: true, cwd: directory, file }, ['package'])
    return await fs.readFile(file)
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
}

function fixture({ bytes, npm = false, repo = {}, packageValue = pkg, manifestValue = manifest, npmRepository = pkg.repository } = {}) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url === 'https://api.github.com/repos/owner/repo') return json({ full_name: 'owner/repo', private: false, archived: false, default_branch: 'main', license: { spdx_id: 'MIT' }, ...repo })
    if (url.endsWith('/commits/main')) return json({ sha: 'a'.repeat(40) })
    if (url.endsWith('/workbench.json')) return json(manifestValue)
    if (url.endsWith('/package.json')) return json(packageValue)
    if (url.endsWith('/client.js') || url.endsWith('/cordis.patch.yml')) return new Response('source')
    if (url.endsWith('/main.png')) return new Response(await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer())
    if (url === 'https://registry.npmjs.org/%40owner%2Fworkbench/latest') return npm
      ? json({ name: pkg.name, version: '1.2.3', repository: npmRepository, dist: { tarball: npmUrl, integrity: `sha512-${digest(bytes, 'sha512', 'base64')}` } })
      : new Response('', { status: 404 })
    if (url.endsWith('/releases/latest')) return json({ assets: [{ name: 'workbench.tgz', browser_download_url: releaseUrl }] })
    if (url === releaseUrl || url === npmUrl) return new Response(bytes)
    throw new Error(`Unexpected URL: ${url}`)
  }
  return { fetchImpl, calls }
}

test('npm wins over Release and source; selects the published version, not the development version', async () => {
  const bytes = await archive()
  const mock = fixture({ bytes, npm: true })
  const result = await probeEntry(record(releaseUrl), mock)
  assert.equal(result.distribution.type, 'npm')
  assert.equal(result.version, '1.2.3')
  assert.equal(result.distribution.name, pkg.name)
  assert.equal(result.distribution.sha256, digest(bytes))
  assert.ok(!mock.calls.includes(releaseUrl))
  assert.ok(!mock.calls.some((url) => url.endsWith('/client.js')))
})

test('falls back to Release when npm is absent, resolving latest to a fixed asset and generated checksum', async () => {
  const bytes = await archive()
  const result = await probeEntry(record('https://github.com/owner/repo/releases/latest/download/workbench.tgz'), fixture({ bytes }))
  assert.equal(result.distribution.type, 'github-release')
  assert.equal(result.distribution.url, releaseUrl)
  assert.equal(result.distribution.sha256, digest(bytes))
  assert.equal(result.version, '1.2.3')
})

test('falls back to pinned source when neither npm nor Release is available', async () => {
  const mock = fixture()
  const result = await probeEntry(record(), mock)
  assert.equal(result.distribution.type, 'github-source')
  assert.equal(result.distribution.commit, 'a'.repeat(40))
  assert.equal(result.version, manifest.version)
  assert.ok(mock.calls.some((url) => url.includes(`/a${'a'.repeat(39)}/./client.js`)))
  assert.match(result.screenshots[0].url, /\/a{40}\/main.png$/)
})

test('npm ownership mismatch falls back instead of linking an unrelated package', async () => {
  const bytes = await archive()
  const result = await probeEntry(record(releaseUrl), fixture({ bytes, npm: true, npmRepository: 'https://github.com/other/repo' }))
  assert.equal(result.distribution.type, 'github-release')
  const mock = fixture({ packageValue: { ...pkg, repository: 'https://github.com/other/repo' } })
  assert.equal((await probeEntry(record(), mock)).distribution.type, 'github-source')
  assert.ok(!mock.calls.some((url) => url.startsWith('https://registry.npmjs.org')))
})

test('selected npm integrity failure blocks publication, without silent fallback', async () => {
  const bytes = await archive()
  const mock = fixture({ bytes, npm: true })
  await assert.rejects(() => probeEntry(record(releaseUrl), { fetchImpl: (url) => url === npmUrl ? new Response('corrupt') : mock.fetchImpl(url) }), /完整性/)
  assert.ok(!mock.calls.includes(releaseUrl))
})

test('rejects package identity mismatch and oversized Release', async () => {
  const bytes = await archive({ id: 'other-workbench' })
  await assert.rejects(() => probeEntry(record(releaseUrl), fixture({ bytes })), /来源不一致/)
  const mock = fixture()
  await assert.rejects(() => probeEntry(record(releaseUrl), { fetchImpl: (url) => url === releaseUrl ? new Response('x', { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }) : mock.fetchImpl(url) }), (error) => error.code === 'release-invalid' && !error.incomplete)
})

test('network failure is incomplete, not evidence that npm is absent', async () => {
  for (const status of [403, 429, 503]) {
    const mock = fixture()
    await assert.rejects(() => probeEntry(record(releaseUrl), { fetchImpl: (url) => url.startsWith('https://registry.npmjs.org') ? new Response('', { status }) : mock.fetchImpl(url) }), (error) => error instanceof ProbeError && error.incomplete)
    assert.ok(!mock.calls.includes(releaseUrl))
  }
})

test('checks repository eligibility and installable manifest', async () => {
  await assert.rejects(() => probeEntry(record(), fixture({ repo: { archived: true } })), /归档/)
  await assert.rejects(() => probeEntry(record(), fixture({ repo: { license: null } })), /许可证/)
  await assert.rejects(() => probeEntry(record(), fixture({ packageValue: { ...pkg, dsh: {} } })), /bundle.patch/)
})

test('market screenshots are taken only from YAML and must decode', async () => {
  const mock = fixture({ manifestValue: { ...manifest, screenshots: ['ignored.png'] } })
  const result = await probeEntry(record(), mock)
  assert.equal(result.screenshots.length, 1)
  assert.equal(result.screenshots[0].width, 2)
  for (const body of [new Response('', { status: 404 }), new Response('<html>wrong content</html>')]) {
    await assert.rejects(() => probeEntry(record(), { fetchImpl: (url) => url.endsWith('/main.png') ? body : mock.fetchImpl(url) }), (error) => error.code === 'invalid-image')
  }
})

test('redirected repository aliases cannot create a second catalog identity', async () => {
  await assert.rejects(() => probeEntry(record(), fixture({ repo: { full_name: 'new-owner/new-name' } })), /旧地址/)
})

test('a missing configured Release does not silently switch to source', async () => {
  const mock = fixture()
  await assert.rejects(() => probeEntry(record(releaseUrl), { fetchImpl: (url) => url === releaseUrl ? new Response('', { status: 404 }) : mock.fetchImpl(url) }), /下载失败/)
  assert.ok(!mock.calls.some((url) => url.endsWith('/client.js')))
})
