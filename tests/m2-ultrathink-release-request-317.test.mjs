import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

test('317#065 official release sends xhigh for ultrathink and respects the explicit opt-out', {
  timeout: 100000,
}, async () => {
  const binary = resolve('dist/cli.js')
  const root = mkdtempSync(join(tmpdir(), 'yaoyao-ultrathink-release-'))
  const config = join(root, 'config')
  mkdirSync(config, { recursive: true })
  const bodies = []
  const server = createServer((request, response) => {
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    if (request.method !== 'POST' || !request.url?.startsWith('/v1/messages')) {
      response.writeHead(404).end()
      return
    }
    let data = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { data += chunk })
    request.on('end', () => {
      const body = JSON.parse(data)
      bodies.push(body)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        sse('message_start', {
          type: 'message_start', message: {
            id: 'msg_ultra_offline', type: 'message', role: 'assistant', model: body.model,
            content: [], stop_reason: null, stop_sequence: null,
            usage: { input_tokens: 9, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        }),
        sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ULTRA_OK' } }),
        sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
        sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }),
        sse('message_stop', { type: 'message_stop' }),
      ].join(''))
    })
  })
  try {
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const baseEnv = {
      ...process.env,
      HOME: root,
      YAOYAOCHE_CONFIG_DIR: config,
      CLAUDE_CONFIG_DIR: config,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
      ANTHROPIC_API_KEY: 'local-fixture-key',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
      CI: '1',
      NO_COLOR: '1',
    }
    const samples = [
      { text: 'please ultrathink and reply ULTRA_OK', expected: 'xhigh', disabled: false },
      { text: 'please reply ULTRA_OK normally', expected: 'medium', disabled: false },
      { text: 'please ultrathink and reply ULTRA_OK', expected: 'medium', disabled: true },
    ]
    for (const sample of samples) {
      bodies.length = 0
      const args = [binary, '--bare', '-p', sample.text, '--model', 'opus',
        '--tools', '', '--output-format', 'json']
      const env = { ...baseEnv }
      if (sample.disabled) env.CLAUDE_CODE_DISABLE_ULTRATHINK = '1'
      else delete env.CLAUDE_CODE_DISABLE_ULTRATHINK
      const result = await new Promise((resolveResult, reject) => {
        const child = spawn('bun', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = '', stderr = ''
        const deadline = setTimeout(() => child.kill('SIGKILL'), 30000)
        child.stdout.on('data', chunk => { stdout += chunk })
        child.stderr.on('data', chunk => { stderr += chunk })
        child.on('error', error => { clearTimeout(deadline); reject(error) })
        child.on('close', code => {
          clearTimeout(deadline)
          resolveResult({ code, stdout, stderr })
        })
      })
      assert.equal(result.code, 0, `CLI failed: ${result.stderr}\n${result.stdout}`)
      assert.equal(JSON.parse(result.stdout).result, 'ULTRA_OK')
      assert.equal(bodies.length, 1, 'expected one real HTTP request from bundled CLI')
      assert.equal(bodies[0].model, 'claude-opus-5-5')
      assert.equal(bodies[0].output_config?.effort, sample.expected,
        `runtime reasoning effort mismatch for ${sample.text}; disabled=${sample.disabled}`)
    }
  } finally {
    server.closeAllConnections()
    await new Promise(resolveClose => server.close(resolveClose))
    rmSync(root, { recursive: true, force: true })
  }
})
