import test from 'node:test'
import assert from 'node:assert/strict'
import { needsReview, preflight } from '../scripts/security-preflight.mjs'

test('catalog changes always reach strict gate; documentation and workflow YAML skip', () => {
  for (const file of [ {filename:'data/workbenches/a__b.yml'}, {filename:'data/workbenches/a.yaml'}, {filename:'elsewhere.txt', previous_filename:'data/workbenches/a__b.yml'} ]) assert.equal(needsReview([file]), true)
  assert.equal(needsReview([{filename:'.github/workflows/test.yml'}, {filename:'submissions/a.md'}]), false)
})

const env = {REPOSITORY:'owner/repo', PR_NUMBER:'3', CANDIDATE_SHA:'c'.repeat(40), GITHUB_TOKEN:'test'}
function mock(files, count = files.length) {
  const writes = []
  return {writes, fetchImpl: async (url, options) => {
    const endpoint = new URL(url).pathname
    if (options.method !== 'GET') { writes.push([endpoint, JSON.parse(options.body)]); return {ok:true, json:async()=>({})} }
    return {ok:true, json:async()=> endpoint.endsWith('/files') ? files : {state:'open',head:{sha:env.CANDIDATE_SHA},base:{ref:'main',repo:{full_name:env.REPOSITORY}},changed_files:count}}
  }}
}
test('non submission gets feature label and neutral head-bound skipped check', async () => {
  const m = mock([{filename:'submissions/a.md'}])
  assert.equal(await preflight({env,fetchImpl:m.fetchImpl}), false)
  assert.deepEqual(m.writes[1][1], {labels:['feature']})
  assert.equal(m.writes[2][1].conclusion, 'neutral')
  assert.equal(m.writes[2][1].head_sha, env.CANDIDATE_SHA)
})
test('YAML submission does not label or publish a passing check before review', async () => {
  const m = mock([{filename:'data/workbenches/a__b.yml'}])
  assert.equal(await preflight({env,fetchImpl:m.fetchImpl}), true)
  assert.equal(m.writes.length, 0)
})
test('incomplete API file inventory fails closed', async () => {
  const m = mock([], 1)
  await assert.rejects(preflight({env,fetchImpl:m.fetchImpl}), /不完整/)
  assert.equal(m.writes.length, 0)
})

test('security bootstrap checks out current trusted main and guards expensive steps', async () => {
  const {readFile} = await import('node:fs/promises')
  const yaml = await import('js-yaml')
  const workflow = yaml.load(await readFile(new URL('../.github/workflows/security-review.yml', import.meta.url), 'utf8'))
  const steps = workflow.jobs.review.steps
  assert.equal(steps[0].with.ref, 'main')
  assert.equal(steps.findIndex(s=>s.id==='classify') < steps.findIndex(s=>s.run==='npm ci --ignore-scripts'), true)
  for(const step of steps.filter(s=>s.run==='npm ci --ignore-scripts' || s.run?.includes('copilot') || s.run==='node scripts/security-pr-gate.mjs')) assert.equal(step.if, "steps.classify.outputs.review == 'true'")
})
