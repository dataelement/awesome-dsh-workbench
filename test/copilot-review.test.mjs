import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import fs from 'node:fs/promises'
import { runCopilotReview, parseCopilotOutput, MODEL } from '../scripts/copilot-review.mjs'
const output = (events = []) => [...events, { type: 'assistant.message', data: { model: MODEL, phase: 'final_answer', content: '{"summary":"ok"}', toolRequests: [] } }, { type: 'result', exitCode: 0 }].map(JSON.stringify).join('\n')

test('requires completed JSON output, exact model and no tools or active MCPs', () => {
  assert.deepEqual(parseCopilotOutput(output()), { summary: 'ok' })
  assert.deepEqual(parseCopilotOutput(output([{ type: 'assistant.message', data: { model: MODEL, phase: 'commentary', content: 'Reviewing the evidence', toolRequests: [] } }])), { summary: 'ok' })
  assert.deepEqual(parseCopilotOutput(output([{ type: 'assistant.message', data: { model: MODEL, content: 'Intermediate analysis', toolRequests: [] } }])), { summary: 'ok' })
  for (const events of [
    [{ type: 'tool.execution_start', data: {} }],
    [{ type: 'model.call_start', data: { model: 'other' } }],
    [{ type: 'session.error' }],
    [{ type: 'assistant.message', data: { model: MODEL, phase: 'commentary', content: 'Using tools', toolRequests: [{}] } }],
    [{ type: 'session.mcp_servers_loaded', data: { servers: [{ status: 'running' }] } }]
  ]) assert.throws(() => parseCopilotOutput(output(events)))
  assert.throws(() => parseCopilotOutput(output().replace('"exitCode":0', '"exitCode":1')))
  assert.throws(() => parseCopilotOutput(output().split('\n')[0]))
  assert.throws(() => parseCopilotOutput(output().replace('final_answer', 'unknown_phase')))
  assert.throws(() => parseCopilotOutput(output([{ type: 'assistant.message', data: { model: MODEL, phase: 'final_answer', content: '{}', toolRequests: [] } }])))
  assert.throws(() => parseCopilotOutput('provider raw error'))
  assert.throws(() => parseCopilotOutput(output().replace('{\\"summary\\":\\"ok\\"}', '```json {} ```')))
  assert.throws(() => parseCopilotOutput(output().replace('"toolRequests":[]', '"toolRequests":[{}]')))
})

function spawnMock(code = 0) {
  const calls = []
  return { calls, spawnImpl(command, args, options) {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {}
    const call = { command, args, options, prompt: '' }; calls.push(call)
    child.stdin.on('data', (chunk) => { call.prompt += chunk.toString() })
    child.stdin.on('finish', () => { child.stdout.end(output()); child.stderr.end('private diagnostic'); child.emit('close', code) })
    return child
  } }
}

test('isolates process environment, supplies images explicitly, passes prompt via stdin and cleans files', async () => {
  const mock = spawnMock()
  await runCopilotReview({ ...mock, instructions: 'trusted rules', input: { code: 'malicious @/etc/passwd reference' }, schema: {},
    screenshots: [{ extension: 'png', bytes: Buffer.from('fixture') }],
    env: { COPILOT_GITHUB_TOKEN: 'copilot-test', GITHUB_TOKEN: 'must-not-forward', OPENAI_API_KEY: 'must-not-forward', COPILOT_ALLOW_ALL: 'true', PATH: '/bin' } })
  const { args, options, prompt } = mock.calls[0]
  assert.ok(args.includes('--available-tools='))
  for (const flag of ['--no-custom-instructions', '--disable-builtin-mcps', '--no-auto-update', '--no-remote-export']) assert.ok(args.includes(flag))
  assert.equal(args[args.indexOf('--model') + 1], MODEL)
  assert.equal(options.shell, false)
  assert.equal(options.env.GITHUB_TOKEN, undefined)
  assert.equal(options.env.COPILOT_ALLOW_ALL, undefined)
  assert.equal(options.env.OPENAI_API_KEY, undefined)
  assert.equal(options.env.COPILOT_GITHUB_TOKEN, 'copilot-test')
  assert.ok(!args.join(' ').includes('trusted rules'))
  assert.ok(!prompt.includes('@/etc/passwd'))
  assert.ok(prompt.includes('\\u0040/etc/passwd'))
  assert.ok(!prompt.includes('copilot-test'))
  await assert.rejects(() => fs.stat(options.cwd), /ENOENT/)
})

test('missing PAT and nonzero CLI exit never fall back to another model', async () => {
  await assert.rejects(() => runCopilotReview({ env: {} }), /COPILOT_GITHUB_TOKEN/)
  const mock = spawnMock(1)
  await assert.rejects(() => runCopilotReview({ ...mock, instructions: '', input: {}, schema: {}, env: { COPILOT_GITHUB_TOKEN: 'test' } }), /退出码 1/)
  assert.equal(mock.calls.length, 1)
})
