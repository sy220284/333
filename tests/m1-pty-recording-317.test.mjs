import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createPtyRecording317 } from '../src/bootstrap/ptyRecording317.mjs'
import { ptyExecFiles317 } from '../src/bootstrap/ptyExecFiles317.mjs'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
const bins = [['rebuilt', 'bun', [cli]]]
const original = process.env.CLAUDE_REFERENCE_BIN || process.env.CLAUDE_TARGET_X64
if (original) bins.unshift(['official', original, []])

function events(bytes) {
  assert.ok(bytes.length >= 8, 'recording missing terminal dimensions')
  const cols = bytes.readUInt32BE(0), rows = bytes.readUInt32BE(4)
  let at = 8
  const out = []
  while (at < bytes.length) {
    assert.ok(at + 8 <= bytes.length, 'truncated recording frame header')
    const elapsedUs = bytes.readUInt32BE(at), size = bytes.readUInt32BE(at + 4)
    at += 8
    assert.ok(at + size <= bytes.length, 'truncated recording frame body')
    out.push({ elapsedUs, body: bytes.subarray(at, at + size) })
    at += size
  }
  return { cols, rows, out }
}

test('317 exec output paths match official Unix socket and Windows daemon pipe folders', () => {
  assert.deepEqual(ptyExecFiles317('/tmp/spare/agent.sock', '/tmp/cfg', 'linux'),
    { exit:'/tmp/spare/agent.sock.exec-exit',late:'/tmp/spare/agent.sock.late' })
  const config = join('/work', 'my-config')
  const name = 'cc-daemon-0123456789abcdef-pty-abcdef'
  const windows = ptyExecFiles317('\\\\.\\pipe\\' + name, config, 'win32')
  assert.equal(windows.exit, join(config, 'daemon','pty-pids',name+'.exec-exit'))
  assert.equal(windows.late, join(config, 'daemon','pty-pids',name+'.late'))
})

test('317 recorder binary framing matches reference header, microseconds, and idempotent close', async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-pty-record-unit-'))
  try {
    const path = join(dir, 'stream.bin')
    let tick = 1_000_000n
    const rec = createPtyRecording317(path, 92, 28, () => tick)
    assert.ok(rec)
    tick += 9000n
    rec.write(Buffer.from('first'))
    tick += 3000n
    rec.write(Buffer.from('last'))
    rec.close()
    rec.close()
    await new Promise((resolve, reject) => {
      const limit = setTimeout(() => reject(Error('recording stream was not flushed')), 3000)
      const poll = () => {
        if (existsSync(path) && readFileSync(path).length === 8 + 8 + 5 + 8 + 4) {
          clearTimeout(limit); resolve()
        } else setTimeout(poll, 15)
      }
      poll()
    })
    const frame = events(readFileSync(path))
    assert.equal(frame.cols, 92)
    assert.equal(frame.rows, 28)
    assert.deepEqual(frame.out.map(p => p.body.toString()), ['first','last'])
    assert.deepEqual(frame.out.map(p => p.elapsedUs), [9,12])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('317 real PTY recording: rebuilt binary and official x64 write the same frame contract',
  { skip: process.platform === 'win32', timeout: 45000 }, async () => {
    for (const [name, exe, args] of bins) {
      const dir = mkdtempSync(join(tmpdir(), '333-pty-record-e2e-'))
      const socket = join(dir, 'pty.sock'), recording = join(dir, 'session.rec')
      const command = [exe, ...args, '--bg-pty-host', socket, '91', '27',
        '--', '/bin/sh', '-c', 'printf "\\033[31mREC_317_OK\\033[0m"']
      let child
      try {
        child = spawn(command[0], command.slice(1), {
          stdio: ['ignore','pipe','pipe'],
          env: { ...process.env, CLAUDE_CONFIG_DIR: dir,
            CLAUDE_PTY_RECORD: recording,
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
            DISABLE_TELEMETRY: '1' },
        })
        let stderr = ''
        child.stderr.on('data', value => { stderr += value })
        const result = await Promise.race([
          new Promise((resolve, reject) => {
            child.once('error', reject)
            child.once('close', (code, signal) => resolve({ code, signal }))
          }),
          new Promise((_, reject) => setTimeout(() => reject(Error(name + ' PTY recorder timeout')), 15000)),
        ])
        assert.equal(result.code, 0, name + ' stderr=' + stderr + ' signal=' + result.signal)
        assert.ok(existsSync(recording), name + ' recording file missing')
        const frame = events(readFileSync(recording))
        assert.deepEqual([frame.cols,frame.rows], [91,27], name)
        assert.ok(frame.out.length >= 1, name + ' recording is empty')
        assert.ok(Buffer.concat(frame.out.map(e => e.body)).includes(Buffer.from('REC_317_OK')),
          name + ' PTY output not recorded')
        for (let i = 1; i < frame.out.length; i++)
          assert.ok(frame.out[i].elapsedUs >= frame.out[i-1].elapsedUs,
            name + ' timestamp order')
        assert.equal(existsSync(socket), false, name + ' leaked socket')
      } finally {
        child?.kill('SIGKILL')
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

test('317 exec-mode PTY writes real exit metadata and late replay for unclaimed session',
  { skip: process.platform === 'win32', timeout: 90000 }, async () => {
    for (const [name, exe, args] of bins) {
      const dir = mkdtempSync(join(tmpdir(), '333-pty-exec-e2e-'))
      const socket = join(dir, 'exec.sock')
      const command = [exe, ...args, '--bg-pty-host', socket, '91', '27',
        '--', '/bin/sh', '-c', 'printf "EXEC_317_RESULT"']
      let child
      try {
        child = spawn(command[0], command.slice(1), {
          stdio: ['ignore','pipe','pipe'],
          env: { ...process.env, CLAUDE_CONFIG_DIR: dir,
            CLAUDE_PTY_HOST_EXEC: '1', DISABLE_TELEMETRY: '1',
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
        })
        let stderr = ''
        child.stderr.on('data', bytes => { stderr += bytes })
        // Register exit listeners before probing startup so an unexpectedly
        // early exit cannot disappear between the checks and the await.
        const closed = new Promise((resolve, reject) => {
          child.once('error', reject)
          child.once('close', (code, signal) => resolve({code, signal}))
        })
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
        const readyDeadline = Date.now() + 20_000
        while (!existsSync(socket) && child.exitCode === null && Date.now() < readyDeadline)
          await sleep(30)
        assert.ok(existsSync(socket), name + ' exec PTY listener never became ready; ' + stderr)
        // Start the output-grace clock when the PTY is listening, rather
        // than when a slow Intel/macOS executable was first spawned.
        const earlyLate = join(dir, 'exec.sock.late')
        const deadline = Date.now() + 5_000
        while (!existsSync(earlyLate) && child.exitCode === null && Date.now() < deadline)
          await sleep(30)
        assert.ok(existsSync(earlyLate), name + ' late tail was not published during grace')
        assert.equal(child.exitCode, null, name + ' closed before subscriber grace')
        const exit = await Promise.race([
          closed,
          new Promise((_, reject) => setTimeout(() => reject(Error(name + ' exec PTY timeout')), 20_000)),
        ])
        assert.equal(exit.code, 0, name + ' stderr=' + stderr)
        const metadata = join(dir, 'exec.sock.exec-exit')
        const late = join(dir, 'exec.sock.late')
        assert.ok(existsSync(metadata), name + ' missing exec metadata')
        assert.ok(existsSync(late), name + ' missing undelivered PTY output')
        const result = JSON.parse(readFileSync(metadata, 'utf8'))
        assert.equal(result.code, 0, name)
        assert.ok(result.tail.includes('EXEC_317_RESULT'), name + JSON.stringify(result))
        assert.ok(readFileSync(late).includes(Buffer.from('EXEC_317_RESULT')), name)
        assert.equal(existsSync(socket), false, name + ' PTY socket leaked')
      } finally {
        child?.kill('SIGKILL')
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })
