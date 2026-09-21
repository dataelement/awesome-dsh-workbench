import assert from 'node:assert/strict'
import test from 'node:test'
import { downloadWindow, enrichMetrics } from '../scripts/metrics-lib.mjs'
import { createPublishedValidator } from '../scripts/published-catalog.mjs'

const now = new Date('2026-09-21T12:00:00Z')
const item = (type = 'npm') => ({ owner: 'Owner', repository: 'Repo', distribution: { type, name: '@owner/tool' } })
const catalog = (type) => ({ workbenches: [item(type)] })
const options = { now, sleep: async () => {}, warn: () => {} }
const json = (body) => new Response(JSON.stringify(body))
const goodFetch = async (url) => url.includes('api.github.com')
  ? json({ full_name: 'Owner/Repo', stargazers_count: 12 })
  : json({ package: '@owner/tool', downloads: 45, start: '2026-08-22', end: '2026-09-20' })

test('UTC window excludes today including leap-year boundaries', () => {
  assert.deepEqual(downloadWindow(now), { start: '2026-08-22', end: '2026-09-20' })
  assert.deepEqual(downloadWindow(new Date('2024-03-01T00:00:00Z')), { start: '2024-01-31', end: '2024-02-29' })
})

test('collects source metrics and deduplicates repositories and packages', async () => {
  const data = { workbenches: [item(), item()] }
  const urls = []
  const cache = await enrichMetrics(data, { ...options, fetchImpl: async (url) => { urls.push(url); return goodFetch(url) } })
  assert.equal(urls.length, 2)
  assert.match(urls[1], /2026-08-22:2026-09-20\/%40owner%2Ftool$/)
  assert.equal(data.workbenches[0].metrics.githubStars.value, 12)
  assert.equal(data.workbenches[0].metrics.npmDownloads30d.value, 45)
  let cachedRequests = 0
  await enrichMetrics(catalog(), { ...options, previous: cache, fetchImpl: () => { cachedRequests++; throw new Error('fresh data must not fetch') } })
  assert.equal(cachedRequests, 0)
})

test('failures retain the old count and old window as stale, never zero', async () => {
  const previous = await enrichMetrics(catalog(), { ...options, fetchImpl: goodFetch })
  const data = catalog()
  await enrichMetrics(data, { ...options, previous, now: new Date('2026-09-23T12:00:00Z'), fetchImpl: async () => { throw new Error('offline') } })
  assert.deepEqual(data.workbenches[0].metrics.npmDownloads30d, { value: 45, checkedAt: now.toISOString(), status: 'stale', start: '2026-08-22', end: '2026-09-20' })
  assert.equal(data.workbenches[0].metrics.githubStars.status, 'stale')
})

test('cold failure is unavailable; source-only downloads are not applicable', async () => {
  const data = catalog('github-source')
  let calls = 0
  await enrichMetrics(data, { ...options, fetchImpl: async () => { calls++; throw new Error('offline') } })
  assert.equal(calls, 1)
  assert.deepEqual(data.workbenches[0].metrics.githubStars, { value: null, checkedAt: null, status: 'unavailable' })
  assert.equal(data.workbenches[0].metrics.npmDownloads30d.status, 'not_applicable')
})

test('rejects mismatched npm package/window and invalid counts, accepts zero', async () => {
  for (const body of [
    { package: 'other', downloads: 10, ...downloadWindow(now) },
    { package: '@owner/tool', downloads: 10, start: '2026-08-21', end: '2026-09-19' },
    { package: '@owner/tool', downloads: -1, ...downloadWindow(now) },
  ]) {
    const data = catalog()
    await enrichMetrics(data, { ...options, fetchImpl: async (url) => url.includes('api.github.com') ? goodFetch(url) : json(body) })
    assert.equal(data.workbenches[0].metrics.npmDownloads30d.status, 'unavailable')
  }
  const data = catalog()
  await enrichMetrics(data, { ...options, fetchImpl: async (url) => url.includes('api.github.com') ? goodFetch(url) : json({ package: '@owner/tool', downloads: 0, ...downloadWindow(now) }) })
  assert.equal(data.workbenches[0].metrics.npmDownloads30d.value, 0)
  assert.equal(data.workbenches[0].metrics.npmDownloads30d.status, 'ok')
})

test('rate limiting obeys bounded Retry-After; force refresh bypasses cache', async () => {
  const previous = await enrichMetrics(catalog(), { ...options, fetchImpl: goodFetch })
  const waits = []
  let attempts = 0
  await enrichMetrics(catalog(), { ...options, previous, force: true, sleep: async (ms) => waits.push(ms), fetchImpl: async (url) => {
    if (url.includes('api.npmjs.org') && attempts++ === 0) return new Response('', { status: 429, headers: { 'retry-after': '3' } })
    return goodFetch(url)
  } })
  assert.equal(attempts, 2)
  assert.deepEqual(waits, [2000, 3000])
})

test('a package identity change cannot inherit another package count', async () => {
  const previous = await enrichMetrics(catalog(), { ...options, fetchImpl: goodFetch })
  const data = catalog()
  data.workbenches[0].distribution.name = 'different'
  await enrichMetrics(data, { ...options, previous, fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(data.workbenches[0].metrics.npmDownloads30d.status, 'unavailable')
})

test('published schema compiles with optional metrics', async () => {
  const validate = await createPublishedValidator()
  assert.equal(validate({ schemaVersion: 1, kind: 'catalog', categories: [], workbenches: [] }), true)
})
