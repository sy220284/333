import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const cli = resolve(import.meta.dirname, '../dist/cli.js')
const bins = [['rebuilt', 'bun', [cli]]]
if (process.env.CLAUDE_REFERENCE_BIN || process.env.CLAUDE_TARGET_X64)
  bins.unshift(['official', process.env.CLAUDE_REFERENCE_BIN || process.env.CLAUDE_TARGET_X64, []])

async function until(check, maxMs = 12000) {
  const deadline = Date.now() + maxMs
  while (!check()) {
    if (Date.now() > deadline) throw Error('bg-spare socket readiness timeout')
    await new Promise(resolve => setTimeout(resolve, 30))
  }
}
function launch(binary, prefix, sock, configDir, auth) {
  const child = spawn(binary, [...prefix, '--bg-spare', sock], {
    stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, CLAUDE_CONFIG_DIR: configDir,
      DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      ...(auth ? { CLAUDE_BG_CLAIM_AUTH: auth } : {}),
    },
  })
  let stdout = '', stderr = '', closed = false
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const done = new Promise(resolve => child.once('close', (code, signal) => {
    closed = true; resolve({ code, signal, stdout, stderr })
  }))
  return { child, done, isClosed: () => closed }
}
async function claim(socket, frame) {
  const peer = connect(socket)
  await new Promise((resolve, reject) => {
    peer.once('error', reject)
    peer.once('connect', resolve)
  })
  peer.end(JSON.stringify(frame) + '\n')
  await new Promise(resolve => peer.once('close', resolve))
}
test('317 spare missing socket argument returns upstream exit status 2', () => {
  for (const [name, binary, prefix] of bins) {
    const r = spawnSync(binary, [...prefix, '--bg-spare'], { encoding: 'utf8', timeout: 6000 })
    assert.ifError(r.error)
    assert.equal(r.status, 2, name + ' ' + JSON.stringify(r))
    assert.match(r.stderr, /\[bg-spare\] missing claim sock path/)
  }
})
test('317 official and rebuilt bg-spare accept a single authenticated claim',
  { skip: process.platform === 'win32', timeout: 70000 }, async () => {
    for (const [name, binary, prefix] of bins) {
      const dir = mkdtempSync(join(tmpdir(), '333-bgspare-'))
      const sock = join(dir, 'claim.sock'), auth = 'm1-317-claim-secret'
      const started = launch(binary, prefix, sock, dir, auth)
      try {
        await until(() => existsSync(sock) || started.isClosed())
        assert.equal(started.isClosed(), false, name + ' spare startup failed')
        await claim(sock, { auth: 'wrong', cwd: dir, env: {}, argv: ['--version'] })
        await new Promise(resolve => setTimeout(resolve, 130))
        assert.equal(started.isClosed(), false, name + ' admitted an invalid claim')
        assert.equal(existsSync(sock), true, name + ' removed socket on bad auth')
        await claim(sock, { auth, cwd: dir, env: {}, argv: ['--version'] })
        const result = await Promise.race([started.done,
          new Promise((_, reject) => setTimeout(() => reject(Error(name + ' spare claim timed out')), 12000))])
        assert.equal(result.code, 0, name + JSON.stringify(result))
        assert.equal(result.stdout.trim(), '2.1.317 (Claude Code)', name)
        assert.equal(existsSync(sock), false, name + ' stale claim socket')
      } finally {
        started.child.kill('SIGKILL')
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })
test('317 spare SIGTERM releases unclaimed socket and exits cleanly',
  { skip: process.platform === 'win32', timeout: 18000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), '333-bgspare-term-'))
    const socket = join(dir, 'unused.sock')
    const started = launch('bun', [cli], socket, dir)
    try {
      await until(() => existsSync(socket))
      started.child.kill('SIGTERM')
      const result = await Promise.race([started.done,
        new Promise((_, reject) => setTimeout(() => reject(Error('spare termination timed out')), 7000))])
      assert.equal(result.code, 0, JSON.stringify(result))
      assert.equal(existsSync(socket), false)
    } finally {
      started.child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  })
