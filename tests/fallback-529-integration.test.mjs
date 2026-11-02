import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { once } from 'node:events'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const compiled = resolve(root, 'dist/cli.js')
const models = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-opus-4-6',
]
const expected = [...Array(3).fill(models[0]), ...Array(3).fill(models[1]), models[2]]

function send(stream, content) {
  const payload = Buffer.from(content)
  stream.writeHead(200, {
    'content-type': 'text/event-stream',
    'content-length': String(payload.length),
  })
  stream.end(payload)
}

function successSse(model) {
  const message = {
    id: 'msg_01_test_529', type: 'message', role: 'assistant', model,
    content: [], stop_reason: null, stop_sequence: null,
    usage: {
      input_tokens: 3, output_tokens: 2,
      cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    },
  }
  const events = [
    ['message_start', { type: 'message_start', message }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }],
    ['message_stop', { type: 'message_stop' }],
  ]
  return events.map(([name, body]) => `event: ${name}\ndata: ${JSON.stringify(body)}\n\n`).join('')
}

async function verify(label, command, args) {
  const calls = []
  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/v1/messages')) {
      res.writeHead(404)
      res.end()
      return
    }
    let json = ''
    for await (const chunk of req) json += chunk.toString('utf8')
    const request = JSON.parse(json)
    calls.push(request.model)
    if (request.model !== models[2]) {
      const payload = JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })
      res.writeHead(529, {
        'content-type': 'application/json',
        'retry-after': '0',
        'content-length': String(Buffer.byteLength(payload)),
      })
      res.end(payload)
      return
    }
    send(res, successSse(request.model))
  })
  const tempHome = mkdtempSync(join(tmpdir(), '333-529-'))
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { port } = server.address()
    const env = {
      ...process.env,
      HOME: tempHome,
      USERPROFILE: tempHome,
      XDG_CONFIG_HOME: tempHome,
      XDG_CACHE_HOME: tempHome,
      ANTHROPIC_API_KEY: 'local-only-fake-key',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      DISABLE_TELEMETRY: '1',
      DISABLE_ERROR_REPORTING: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      NO_PROXY: '127.0.0.1,localhost',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
    }
    // The fixture deliberately does not enable the legacy hidden bypass switch.
    delete env.FALLBACK_FOR_ALL_PRIMARY_MODELS
    const child = spawn(command, [...args, '--bare', '--print', 'Reply OK', '--model',
      models[0], '--fallback-model', `${models[1]},${models[2]}`,
      '--tools', '', '--no-session-persistence', '--output-format', 'json'], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const guard = setTimeout(() => child.kill(), 25000)
    try {
      const [exitCode] = await once(child, 'close')
      assert.equal(exitCode, 0, `${label} exited ${exitCode}: ${stderr}\n${stdout.slice(0, 1000)}`)
    } finally {
      clearTimeout(guard)
    }
    assert.deepEqual(calls, expected, `${label} must fallback after 3 overloaded responses per model`)
    const output = JSON.parse(stdout)
    assert.equal(output.type, 'result')
    assert.equal(output.is_error, false)
    assert.equal(output.result, 'OK')
    assert.ok(output.modelUsage?.[models[2]], 'Final model usage must match actual successful model')
  } finally {
    await new Promise((resolveClose, reject) =>
      server.close(error => error ? reject(error) : resolveClose()))
    rmSync(tempHome, { recursive: true, force: true })
  }
}

test('2.1.310 多级回退：三次 529 后逐级切换，不依赖旧隐藏开关', { timeout: 65000 }, async () => {
  assert.ok(existsSync(compiled), 'Run bun build/rebuild.mjs first')
  await verify('rebuilt', 'bun', [compiled])
  if (process.env.CLAUDE_2310_X64) {
    await verify('official-x64', process.env.CLAUDE_2310_X64, [])
  }
})
