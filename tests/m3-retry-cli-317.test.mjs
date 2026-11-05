import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

function success(model) {
  return [
    ['message_start', { type: 'message_start', message: { id: 'msg_retry', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 8, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'RETRY_OK' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

async function run(executable, scenario) {
  const home = mkdtempSync(join(tmpdir(), '333-m3-retry-'))
  const calls = []
  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/v1/messages')) { res.writeHead(404); res.end(); return }
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    calls.push({ body, time: Date.now() })
    const failure = scenario.error(calls.length)
    if (failure) {
      res.writeHead(failure.status, { 'content-type': 'application/json', 'retry-after': failure.after ?? '0' })
      res.end(JSON.stringify({ type: 'error', error: { type: failure.status === 400 ? 'invalid_request_error' : 'api_error', message: failure.message ?? 'retry fixture' } }))
    } else { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(success(body.model)) }
  })
  let child
  try {
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, 'config'),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANTHROPIC_API_KEY: 'local-m3-fixture',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
      CLAUDE_CODE_MAX_RETRIES: '2', NO_PROXY: '127.0.0.1,localhost', HTTP_PROXY: '', HTTPS_PROXY: '', CI: '1', ...scenario.env }
    const args = ['--bare', '-p', 'Reply RETRY_OK', '--model', 'sonnet', '--tools', '', '--no-session-persistence', '--output-format', 'json']
    args.push(...(scenario.args ?? []))
    child = spawn(executable, executable === 'bun' ? [resolve('dist/cli.js'), ...args] : args, { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', x => { out += x }); child.stderr.on('data', x => { err += x })
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
    const code = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done) }).finally(() => clearTimeout(timer))
    assert.notEqual(code, null, `${scenario.name}: timed out ${err}`)
    assert.equal(calls.length, scenario.calls, `${scenario.name}: ${executable}: ${out}\n${err}`)
    const result = JSON.parse(out.trim())
    assert.equal(result.is_error, scenario.failed ?? false, out)
    if (!scenario.failed) assert.equal(result.result, 'RETRY_OK')
    if (scenario.minimumWait) assert.ok(calls[1].time - calls[0].time >= scenario.minimumWait)
    if (scenario.display) assert.deepEqual(calls.map(x => x.body.thinking?.display), scenario.display)
    if (scenario.maxTokens) assert.deepEqual(calls.map(x => x.body.max_tokens), scenario.maxTokens)
    return { code, calls: calls.map(x => x.body.max_tokens), failed: result.is_error }
  } finally {
    if (child?.exitCode === null) child.kill('SIGKILL')
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    rmSync(home, { recursive: true, force: true })
  }
}

const scenarios = [
  { name: '500 retries with backoff even when Retry-After is zero', calls: 2, minimumWait: 480, error: n => n === 1 ? { status: 500 } : null },
  { name: 'long Retry-After exits immediately', calls: 1, failed: true, error: () => ({ status: 500, after: '61' }) },
  { name: 'non-retryable status does not retry', calls: 1, failed: true, error: () => ({ status: 418 }) },
  { name: 'zero retry budget', calls: 1, failed: true, env: { CLAUDE_CODE_MAX_RETRIES: '0' }, error: () => ({ status: 500 }) },
  { name: 'overflow shrinks max_tokens', calls: 2, maxTokens: [128000, 5000], error: n => n === 1 ? { status: 400, message: 'input length and `max_tokens` exceed context limit: 94000 + 128000 > 100000' } : null },
  { name: 'overflow without progress exits', calls: 2, failed: true, maxTokens: [128000, 5000], error: () => ({ status: 400, message: 'input length and `max_tokens` exceed context limit: 94000 + 128000 > 100000' }) },
]
for (const scenario of scenarios) test(`317 API request: ${scenario.name}`, { timeout: 35000 }, async () => {
  const actual = await run('bun', scenario)
  if (process.env.CLAUDE_CODE_317_REFERENCE) assert.deepEqual(await run(process.env.CLAUDE_CODE_317_REFERENCE, scenario), actual)
})

test('317 API request: explicitly rejected thinking display is removed from the real resend', { timeout: 35000 }, async () => {
  await run('bun', {
    name: 'thinking display rejection', calls: 2, display: ['omitted', undefined],
    args: ['--thinking', 'adaptive'],
    error: n => n === 1 ? { status: 422, message: 'Unsupported field thinking.display' } : null,
  })
})
