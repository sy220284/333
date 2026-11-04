import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkDaemonStartupProxy317 } from '../src/bootstrap/daemonProxy317.ts'
import { validateHeartbeatConfig317, runDaemonWorker317, watchDaemonWorkerParent317 }
  from '../src/bootstrap/daemonWorker317.mjs'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
const original = process.env.CLAUDE_REFERENCE_BIN || process.env.CLAUDE_TARGET_X64
const bins = [['rebuilt', 'bun', [cli]]]
if (original) bins.unshift(['official', original, []])

function launch(binary, args, data, stopOnHeartbeat = false, extraEnv = {}) {
  return new Promise((done, fail) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', ...extraEnv },
    })
    let stdout = '', stderr = '', finished = false, stopSent = false
    // The worker can take several seconds to cold-start on macOS Intel.
    // Signal only after the protocol has emitted a real heartbeat.
    child.stdout.on('data', c => {
      stdout += c
      if (stopOnHeartbeat && !stopSent && stdout.split(/\r?\n/).includes('heartbeat')) {
        stopSent = true
        child.kill('SIGTERM')
      }
    })
    child.stderr.on('data', c => { stderr += c })
    const limit = setTimeout(() => {
      if (!finished) { finished = true; child.kill('SIGKILL'); fail(Error('daemon hung: ' + args.join(' '))) }
    }, 30_000)
    child.once('error', e => { if (!finished) { finished = true; clearTimeout(limit); fail(e) } })
    child.once('close', (code, signal) => {
      if (!finished) { finished = true; clearTimeout(limit); done({ code, signal, stdout, stderr }) }
    })
    child.stdin.end(data)
  })
}

test('317 strict heartbeat config: positive numbers, no unknown keys', () => {
  assert.deepEqual(validateHeartbeatConfig317({}), { ok: true, intervalSeconds: 30 })
  assert.deepEqual(validateHeartbeatConfig317({ intervalSeconds: 0.1 }), { ok: true, intervalSeconds: 0.1 })
  for (const invalid of [null, undefined, [], 3, 'x', { intervalSeconds: 0 },
    { intervalSeconds: -1 }, { intervalSeconds: '1' }, { other: true }])
    assert.equal(validateHeartbeatConfig317(invalid).ok, false, JSON.stringify(invalid))
})

test('317 official and rebuilt refuse unsupported worker kinds before input', async () => {
  for (const [kind, code, message] of [
    ['invalid', 2, 'unknown worker kind: invalid'],
    ['scheduled', 78, "worker kind 'scheduled' is not available."],
    ['remoteControl', 78, "worker kind 'remoteControl' is not available."],
  ]) {
    for (const [name, binary, prefix] of bins) {
      const res = await launch(binary, [...prefix, '--daemon-worker', kind], '{}')
      assert.equal(res.code, code, name + JSON.stringify(res))
      assert.equal(res.stderr.trim(), message, name)
      assert.equal(res.stdout, '', name)
    }
  }
})

test('317 official and rebuilt validate daemon stdin and exit status', async () => {
  const cases = [
    ['garbage', 2, /invalid config JSON on stdin:/],
    ['{}', 2, /config validation failed:/],
    ['{"config":{"intervalSeconds":0}}', 2, /Too small: expected number to be >0/],
    ['{"config":{"intervalSeconds":1,"other":1}}', 2, /"code": "unrecognized_keys"/],
  ]
  for (const [data, code, expected] of cases) {
    for (const [name, binary, prefix] of bins) {
      const res = await launch(binary, [...prefix, '--daemon-worker', 'heartbeat'], data)
      assert.equal(res.code, code, name + JSON.stringify(res))
      assert.match(res.stderr, expected, name + data)
    }
  }
})

test('317 daemon heartbeat emits periodic events and stops on SIGTERM', { timeout: 75000 }, async () => {
  let officialExit
  for (const [name, binary, prefix] of bins) {
    const res = await launch(binary, [...prefix, '--daemon-worker', 'heartbeat'],
      '{"config":{"intervalSeconds":0.1}}', true)
    if (name === 'official') officialExit = { code: res.code, signal: res.signal }
    if (officialExit && name !== 'official')
      assert.deepEqual({ code: res.code, signal: res.signal }, officialExit,
        name + ' differs from official termination: ' + JSON.stringify(res))
    else if (process.platform === 'win32')
      assert.equal(res.signal, 'SIGTERM', name + JSON.stringify(res))
    else assert.equal(res.code, 0, name + JSON.stringify(res))
    const lines = res.stdout.trim().split('\n')
    assert.equal(lines[0], 'heartbeat worker started (interval=0.1s)', name)
    assert.ok(lines.slice(1).includes('heartbeat'), name + JSON.stringify(res))
  }
})

test('317 IPC shutdown and parent watchdog release resources', { timeout: 6000 }, async () => {
  const controller = new AbortController()
  let gone = 0
  const cleanup = watchDaemonWorkerParent317(controller, {
    parentPid: () => 99, isAlive: () => false, onGone: () => { gone++ },
    intervalMs: 8, exitGraceMs: 10, log: () => {},
  })
  await new Promise(done => setTimeout(done, 45))
  assert.equal(controller.signal.aborted, true)
  assert.equal(gone, 1)
  cleanup()
  const parent = new EventEmitter()
  let output = '', error = ''
  const outcome = runDaemonWorker317('heartbeat', {
    parent,
    input: (async function* () { yield Buffer.from('{"config":{"intervalSeconds":10}}') })(),
    stdout: s => { output += s }, stderr: s => { error += s },
    parentWatcher: () => () => {},
  })
  await new Promise(done => setTimeout(done, 25))
  parent.emit('message', { type: 'shutdown' })
  assert.equal(await outcome, 0)
  assert.match(output, /heartbeat worker started/)
  assert.equal(error, '')
  assert.equal(parent.listenerCount('SIGTERM'), 0)
  assert.equal(parent.listenerCount('message'), 0)
})

test('317 daemon proxy is selected by original case-sensitive priority', () => {
  assert.equal(checkDaemonStartupProxy317({}), null)
  assert.equal(checkDaemonStartupProxy317({
    https_proxy: 'http://127.0.0.1:8888', HTTP_PROXY: 'bad proxy',
  }), null)
  assert.match(checkDaemonStartupProxy317({ HTTPS_PROXY: 'data:proxy' }),
    /Invalid proxy URL in HTTPS_PROXY/)
  assert.match(checkDaemonStartupProxy317({ HTTP_PROXY: 'bad\x01 proxy' }),
    /"bad proxy" cannot be parsed/)
})

test('317 daemon refuses invalid proxy before parsing worker kind or stdin', {
  timeout: 75_000,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-daemon-proxy-'))
  const env = {
    CLAUDE_CONFIG_DIR: dir,
    https_proxy: undefined, HTTPS_PROXY: undefined,
    http_proxy: 'bad url', HTTP_PROXY: undefined,
    ALL_PROXY: undefined, all_proxy: undefined,
    CLAUDE_CODE_HOST_CREDS_FILE: undefined,
  }
  try {
    for (const [name, binary, prefix] of bins) {
      const result = await launch(binary, [...prefix, '--daemon-worker', 'invalid'],
        '{}', false, env)
      assert.equal(result.code, 78, name + JSON.stringify(result))
      assert.equal(result.stdout, '', name)
      assert.equal(result.stderr.trim(), [
        'Invalid proxy URL in http_proxy: "bad url" cannot be parsed as a URL.',
        'Proxy settings must be a complete URL including the scheme, e.g. "http://proxy.example.com:8080".',
        'Fix or unset http_proxy and restart Claude Code.',
        'Error: the proxy setting named above is refused.',
        'Start the daemon again once this is mended.',
      ].join('\n'), name)
    }
  } finally {
    rmSync(dir, {recursive: true, force: true})
  }
})
