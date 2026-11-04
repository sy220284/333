import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import { validateHeartbeatConfig317, runDaemonWorker317, watchDaemonWorkerParent317 }
  from '../src/bootstrap/daemonWorker317.mjs'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
const original = process.env.CLAUDE_REFERENCE_BIN || process.env.CLAUDE_TARGET_X64
const bins = [['rebuilt', 'bun', [cli]]]
if (original) bins.unshift(['official', original, []])

function launch(binary, args, data, signalAfterMs = 0) {
  return new Promise((done, fail) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    })
    let stdout = '', stderr = '', finished = false
    child.stdout.on('data', c => { stdout += c })
    child.stderr.on('data', c => { stderr += c })
    const limit = setTimeout(() => {
      if (!finished) { finished = true; child.kill('SIGKILL'); fail(Error('daemon hung: ' + args.join(' '))) }
    }, 8000)
    child.once('error', e => { if (!finished) { finished = true; clearTimeout(limit); fail(e) } })
    child.once('close', (code, signal) => {
      if (!finished) { finished = true; clearTimeout(limit); done({ code, signal, stdout, stderr }) }
    })
    child.stdin.end(data)
    if (signalAfterMs) setTimeout(() => { if (!finished) child.kill('SIGTERM') }, signalAfterMs)
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
    ['{"config":{"intervalSeconds":1,"other":1}}', 2, /Unrecognized key: "other"/],
  ]
  for (const [data, code, expected] of cases) {
    for (const [name, binary, prefix] of bins) {
      const res = await launch(binary, [...prefix, '--daemon-worker', 'heartbeat'], data)
      assert.equal(res.code, code, name + JSON.stringify(res))
      assert.match(res.stderr, expected, name + data)
    }
  }
})

test('317 daemon heartbeat emits periodic events and stops on SIGTERM', { timeout: 25000 }, async () => {
  for (const [name, binary, prefix] of bins) {
    const res = await launch(binary, [...prefix, '--daemon-worker', 'heartbeat'],
      '{"config":{"intervalSeconds":0.1}}', 1200)
    assert.equal(res.code, 0, name + JSON.stringify(res))
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
