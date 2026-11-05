import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

type RequestBody = { model: string; max_tokens: number; thinking?: unknown; output_config?: unknown }
const reference = process.env.CLAUDE_CODE_317_REFERENCE
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

test('317 real CLI requests align model alias, context suffix, effort and output budgets', { timeout: 180_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-m2-request-'))
  let bodies: RequestBody[] = []
  const server = createServer((req, res) => {
    if (req.method === 'HEAD') { res.end(); return }
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) { res.writeHead(404).end(); return }
    let bytes = ''
    req.on('data', chunk => { bytes += chunk })
    req.on('end', () => {
      const body = JSON.parse(bytes) as RequestBody
      bodies.push(body)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end([
        sse('message_start', { type: 'message_start', message: {
          id: 'msg_m2_317', type: 'message', role: 'assistant', model: body.model,
          content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 8, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        } }),
        sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'M2_OK' } }),
        sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
        sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }),
        sse('message_stop', { type: 'message_stop' }),
      ].join(''))
    })
  })
  try {
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const env = { ...process.env, HOME: dir, CLAUDE_CONFIG_DIR: join(dir, 'config'),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`, ANTHROPIC_API_KEY: 'sk-local-m2-fixture',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', CI: '1', NO_COLOR: '1' }
    const variants: Array<{ alias: string; model: string; max: number; effort: string; settings?: object; flags?: string[] }> = [
      { alias: 'opus', model: 'claude-opus-5-5', max: 128000, effort: 'medium' },
      { alias: 'sonnet', model: 'claude-sonnet-5-5', max: 128000, effort: 'medium' },
      { alias: 'haiku', model: 'claude-haiku-5-5', max: 128000, effort: 'medium' },
      { alias: 'claude-opus-5-5[1m]', model: 'claude-opus-5-5', max: 128000, effort: 'medium' },
      { alias: 'opus', model: 'claude-opus-5-5', max: 128000, effort: 'low', settings: { modelSettings: { 'claude-opus-5-5': { effortLevel: 'low' } } } },
      { alias: 'opus', model: 'claude-opus-5-5', max: 128000, effort: 'medium', settings: { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } } },
      { alias: 'opus', model: 'claude-opus-5-5', max: 128000, effort: 'low', settings: { maxEffortLevel: 'low' }, flags: ['--effort', 'max'] },
    ]
    for (const variant of variants) {
      const captured: unknown[] = []
      for (const executable of [...(reference ? [reference] : []), 'bun']) {
        bodies = []
        const args = ['--bare', '-p', 'Reply M2_OK', '--model', variant.alias, '--tools', '', '--output-format', 'json', ...(variant.settings ? ['--settings', JSON.stringify(variant.settings)] : []), ...(variant.flags ?? [])]
        const result = await new Promise<{ code: number | null; out: string; err: string }>((done, reject) => {
          const child = spawn(executable, executable === 'bun' ? [resolve('dist/cli.js'), ...args] : args,
            { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
          let out = '', err = ''
          const timer = setTimeout(() => child.kill('SIGKILL'), 30_000)
          child.stdout.on('data', chunk => { out += chunk })
          child.stderr.on('data', chunk => { err += chunk })
          child.on('error', error => { clearTimeout(timer); reject(error) })
          child.on('close', code => { clearTimeout(timer); done({ code, out, err }) })
        })
        assert.equal(result.code, 0, `${executable}: ${result.err} ${result.out}`)
        const output = JSON.parse(result.out)
        assert.equal(output.result, 'M2_OK')
        assert.equal(bodies.length, 1, executable)
        const body = bodies[0]!
        const semantics = { cost: output.total_cost_usd, model: body.model, max: body.max_tokens, effort: body.output_config, thinking: body.thinking }
        captured.push(semantics)
        assert.equal(body.model, variant.model, `${executable}: ${variant.alias}`)
        assert.equal(body.max_tokens, variant.max, executable)
        assert.deepEqual(body.output_config, { effort: variant.effort }, executable)
        assert.deepEqual(body.thinking, { type: 'adaptive', display: 'omitted' }, executable)
      }
      if (reference) assert.deepEqual(captured[1], captured[0], variant.alias)
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>(done => server.close(() => done()))
    rmSync(dir, { recursive: true, force: true })
  }
})
