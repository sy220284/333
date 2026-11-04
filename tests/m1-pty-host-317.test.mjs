import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createPtyFrameDecoder317, encodePtyControl317, encodePtyData317 } from '../src/bootstrap/ptyWire317.mjs'
import { parsePtyHostArgs317 } from '../src/bootstrap/ptyHost317.mjs'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
const original = process.env.CLAUDE_REFERENCE_BIN || process.env.CLAUDE_TARGET_X64
const bins = [['rebuilt', 'bun', [cli]]]
if (original) bins.unshift(['official', original, []])

async function until(check, timeout = 12000) {
  const end = Date.now() + timeout
  while (!check()) {
    if (Date.now() > end) throw Error('PTY host readiness timeout')
    await new Promise(resolve => setTimeout(resolve, 35))
  }
}

test('317 PTY five-byte frame codec: fragmented data, control and oversize', () => {
  const output = [], failures = []
  const decode = createPtyFrameDecoder317(frame => output.push(frame),
    reason => failures.push(reason))
  const messages = Buffer.concat([
    encodePtyControl317({ t: 'hello', replPid: 123, version: '2.1.317' }),
    encodePtyData317(Buffer.from('START_OK')),
    encodePtyControl317({ t: 'ping' }),
  ])
  for (let at = 0; at < messages.length; at += 3)
    decode(messages.subarray(at, at + 3))
  assert.deepEqual(output.map(frame => frame.kind === 1 ? frame.ctrl.t : frame.payload.toString()),
    ['hello', 'START_OK', 'ping'])
  assert.deepEqual(failures, [])
  decode(Buffer.from([0, 16, 0, 1, 0]))
  assert.match(failures[0], /frame too large/)
  assert.deepEqual(parsePtyHostArgs317(['/tmp/x.sock', '90', '30', '--', 'node', '-v']),
    { socket: '/tmp/x.sock', cols: 90, rows: 30, command: ['node', '-v'], spawnSpare: false })
  assert.throws(() => parsePtyHostArgs317(['/tmp/x.sock', '90']), /bad argv/)
})

test('317 PTY official and rebuilt: real child, live socket, replay and exit',
  { skip: process.platform === 'win32', timeout: 70000 }, async () => {
    for (const [name, executable, prefix] of bins) {
      const dir = mkdtempSync(join(tmpdir(), '333-pty317-'))
      const socket = join(dir, 'child.pty.sock')
      const command = [process.execPath, '-e',
        "process.stdout.write('PTY317_E2E'); setTimeout(() => process.exit(0), 700)"]
      const child = spawn(executable, [...prefix, '--bg-pty-host', socket, '80', '25', '--', ...command], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, DISABLE_TELEMETRY: '1',
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CONFIG_DIR: dir },
      })
      let stderr = '', closed = false, code, signal
      child.stderr.on('data', c => { stderr += c })
      const exit = new Promise(resolve => child.once('exit', (status, sig) => {
        closed = true; code = status; signal = sig; resolve()
      }))
      let peer
      try {
        await until(() => existsSync(socket) || closed)
        assert.equal(closed, false, name + ' ' + stderr)
        peer = connect(socket)
        const frames = [], failures = []
        const decode = createPtyFrameDecoder317(frame => {
          frames.push(frame.kind === 1 ? frame.ctrl : frame.payload.toString('utf8'))
          if (frame.kind === 1 && frame.ctrl.t === 'ping')
            peer.write(encodePtyControl317({ t: 'pong' }))
        }, reason => failures.push(reason))
        peer.on('data', decode)
        await until(() => frames.some(frame => frame.t === 'exit') || closed, 17000)
        await Promise.race([exit, new Promise((_, reject) => setTimeout(() => reject(Error(name + ' exit hung')), 15000))])
        assert.equal(code, 0, name + ' ' + stderr + ' signal=' + signal)
        assert.equal(failures.length, 0)
        assert.equal(frames[0]?.t, 'hello', name + JSON.stringify(frames))
        assert.equal(frames[0]?.version, '2.1.317', name)
        assert.ok(frames.some(frame => typeof frame === 'string' && frame.includes('PTY317_E2E')),
          name + JSON.stringify(frames))
        assert.ok(frames.some(frame => frame.t === 'live'), name)
        assert.ok(frames.some(frame => frame.t === 'ping'), name)
        assert.ok(frames.some(frame => frame.t === 'exit' && frame.code === 0), name)
        await until(() => !existsSync(socket), 4000)
      } finally {
        peer?.destroy()
        if (!closed) child.kill('SIGKILL')
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })
