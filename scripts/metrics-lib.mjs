// Statistics enrich the catalog; they are never installation or user counts.
const DAY = 86400000
export function downloadWindow(now) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY)
  return { start: new Date(end.getTime() - 29 * DAY).toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

async function request(url, { fetchImpl, sleep }) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } })
    if (response.ok) return response.json()
    if (attempt >= 3 || (response.status !== 429 && response.status < 500)) throw new Error(`HTTP ${response.status}`)
    const retry = Number(response.headers.get('retry-after'))
    await sleep(Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 30000) : 1000 * 2 ** attempt)
  }
}

function validValue(metric) {
  return metric && Number.isSafeInteger(metric.value) && metric.value >= 0
    && typeof metric.checkedAt === 'string' && Number.isFinite(Date.parse(metric.checkedAt))
}

const MAX_RELEASE_PAGES = 10
function releaseAssetName(url) {
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
  if (!name) throw new Error('release asset name missing')
  return name
}
async function countReleaseDownloads(id, asset, { fetchImpl, sleep }) {
  let total = 0
  for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
    const releases = await request(`https://api.github.com/repos/${id}/releases?per_page=100&page=${page}`, { fetchImpl, sleep })
    if (!Array.isArray(releases)) throw new Error('release list is not an array')
    for (const release of releases) {
      if (release?.draft || !Array.isArray(release?.assets)) continue
      for (const file of release.assets) {
        if (file?.name !== asset) continue
        if (!Number.isSafeInteger(file.download_count) || file.download_count < 0) throw new Error('invalid release download count')
        total += file.download_count
      }
    }
    if (releases.length < 100) return total
  }
  throw new Error('too many releases to count')
}

// Prior data is matched by repository, npm package and release asset, never by display name.
export async function enrichMetrics(catalog, {
  previous = {}, fetchImpl = fetch, now = new Date(), force = false,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  warn = console.warn,
} = {}) {
  const checkedAt = now.toISOString()
  const window = downloadWindow(now)
  const cache = { repositories: {}, packages: {}, releases: {} }
  const fresh = (old) => !force && old?.status === 'ok' && validValue(old) && now - new Date(old.checkedAt) >= 0 && now - new Date(old.checkedAt) < DAY
  async function collect(old, query) {
    try {
      const value = await query()
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid count')
      return { value, checkedAt, status: 'ok' }
    } catch (error) {
      warn(`Statistics unavailable: ${error.message}`)
      return validValue(old) ? { ...old, status: 'stale' } : { value: null, checkedAt: null, status: 'unavailable' }
    }
  }
  for (const item of catalog.workbenches) {
    const id = `${item.owner}/${item.repository}`.toLowerCase()
    if (!cache.repositories[id]) {
      const old = previous?.repositories?.[id]
      cache.repositories[id] = fresh(old) ? { ...old, status: 'ok' } : await collect(old, async () => {
        const repo = await request(`https://api.github.com/repos/${id}`, { fetchImpl, sleep })
        if (repo.full_name?.toLowerCase() !== id) throw new Error('repository identity mismatch')
        return repo.stargazers_count
      })
    }
    let downloads = { value: null, checkedAt: null, status: 'not_applicable' }
    if (item.distribution.type === 'npm') {
      // Distribution has already passed repository and package identity validation.
      const name = item.distribution.name
      const key = `${id}:${name}`
      if (!cache.packages[key]) {
        const candidate = previous?.packages?.[key]
        const old = validValue(candidate) && /^\d{4}-\d{2}-\d{2}$/.test(candidate.start ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(candidate.end ?? '') ? candidate : undefined
        if (fresh(old) && old.start === window.start && old.end === window.end) cache.packages[key] = { ...old, status: 'ok' }
        else {
          // Pace requests, including unscoped packages: predictable load beats bursts.
          await sleep(2000)
          const metric = await collect(old, async () => {
            const row = await request(`https://api.npmjs.org/downloads/point/${window.start}:${window.end}/${encodeURIComponent(name)}`, { fetchImpl, sleep })
            if (row.package !== name || row.start !== window.start || row.end !== window.end) throw new Error('npm identity or window mismatch')
            return row.downloads
          })
          cache.packages[key] = metric.status === 'ok' ? { ...metric, ...window } : metric
        }
      }
      downloads = cache.packages[key]
    }
    let releaseDownloads = { value: null, checkedAt: null, status: 'not_applicable' }
    if (item.distribution.type === 'github-release') {
      // Counts the listed package file across every release, so the total survives version bumps.
      const asset = releaseAssetName(item.distribution.url)
      const key = `${id}:${asset}`
      if (!cache.releases[key]) {
        const old = previous?.releases?.[key]
        cache.releases[key] = fresh(old) ? { ...old, status: 'ok' } : await collect(old, () => countReleaseDownloads(id, asset, { fetchImpl, sleep }))
      }
      releaseDownloads = cache.releases[key]
    }
    item.metrics = { githubStars: cache.repositories[id], npmDownloads30d: downloads, githubReleaseDownloads: releaseDownloads }
  }
  return cache
}
