import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { applyPreloadClaim317, validatePreloadClaim317 } from '../src/bootstrap/preload317.mjs'

const root = resolve(import.meta.dirname, '..')
const cli = join(root, 'dist/cli.js')

async function until(check, timeout = 12_000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() >= deadline) throw Error('Preload socket did not become ready')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
function spawnPreload(bin, prefix, socket) {
  const child = spawn(bin, [...prefix, '--preload', socket], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
  })
  let stdout = '', stderr = ''
  child.stdout.on('data', c => { stdout += c })
  child.stderr.on('data', c => { stderr += c })
  const done = new Promise(resolve => {
    child.once('error', error => resolve({ error, stdout, stderr }))
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  return { child, done }
}
function sendClaim(socket, claim) {
  return new Promise((resolve, reject) => {
    const stream = connect(socket)
    stream.once('connect', () => { stream.end(JSON.stringify(claim) + '\n'); resolve() })
    stream.once('error', reject)
  })
}
test('M1 C19-T02 preload claim validates every field before changing process state', () => {
  const home = mkdtempSync(join(tmpdir(), '333-preload-validate-'))
  try {
    assert.throws(() => validatePreloadClaim317({ cwd: home, argv: [1], env: {} }), /argv/)
    assert.throws(() => validatePreloadClaim317({ cwd: home, argv: [], env: { 'INVALID-NAME': 'x' } }), /name/)
    assert.throws(() => validatePreloadClaim317({ cwd: home, argv: [], env: { GOOD: 'bad\0value' } }), /value/)
    const before = { CLAUDE_CODE_SESSION_ID: 'old', ANTHROPIC_API_KEY: 'old', KEEP: 'yes' }
    const argv = ['bun', 'cli', '--preload']
    let moved
    applyPreloadClaim317({ cwd: home, argv: ['--version'], env: { ANTHROPIC_API_KEY: 'new', FRESH: 'yes' } }, {
      env: before, argv, chdir: target => { moved = target },
    })
    assert.equal(moved, home)
    assert.deepEqual(argv, ['bun', 'cli', '--version'])
    assert.equal(before.CLAUDE_CODE_SESSION_ID, undefined)
    assert.equal(before.ANTHROPIC_API_KEY, 'new')
    assert.equal(before.KEEP, 'yes')
  } finally { rmSync(home, { recursive: true, force: true }) }
})
test('M1 C19-T02 official and rebuilt preload accept a claim, run --version, release socket and pid', {
  skip: process.platform === 'win32', timeout: 90_000,
}, async () => {
  const bins = [['rebuilt', 'bun', [cli]]]
  if (process.env.CLAUDE_TARGET_X64) bins.unshift(['official', process.env.CLAUDE_TARGET_X64, []])
  for (const [name, bin, prefix] of bins) {
    const home = mkdtempSync(join(tmpdir(), '333-preload-e2e-'))
    const sock = join(home, 'claim.sock')
    const started = spawnPreload(bin, prefix, sock)
    try {
      await until(() => existsSync(sock) || started.child.exitCode !== null)
      assert.equal(started.child.exitCode, null, name + ' startup failed')
      await until(() => existsSync(sock + '.pid'))
      assert.equal(readFileSync(sock + '.pid', 'utf8'), String(started.child.pid), name + ' pid')
      await sendClaim(sock, { cwd: home, argv: ['--version'], env: {
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1',
      } })
      const result = await Promise.race([started.done, new Promise((_, reject) => setTimeout(() => reject(Error(name + ' claim hung')), 20_000))])
      assert.equal(result.code, 0, name + ' ' + JSON.stringify(result))
      assert.equal(result.stdout.trim(), '2.1.317 (Claude Code)', name)
      assert.equal(existsSync(sock), false, name + ' socket')
      assert.equal(existsSync(sock + '.pid'), false, name + ' pid')
    } finally {
      started.child.kill('SIGTERM')
      rmSync(home, { recursive: true, force: true })
    }
  }
})
test('M1 C19-T02 preload TERM releases the claim socket and pid without a session', {
  skip: process.platform === 'win32', timeout: 30_000,
}, async () => {
  const home = mkdtempSync(join(tmpdir(), '333-preload-stop-'))
  const socket = join(home, 'claim.sock')
  const started = spawnPreload('bun', [cli], socket)
  try {
    await until(() => existsSync(socket) && existsSync(socket + '.pid'))
    started.child.kill('SIGTERM')
    const result = await Promise.race([started.done, new Promise((_, reject) => setTimeout(() => reject(Error('terminate hung')), 8_000))])
    assert.equal(result.code, 0, JSON.stringify(result))
    assert.equal(existsSync(socket), false)
    assert.equal(existsSync(socket + '.pid'), false)
  } finally { started.child.kill('SIGKILL'); rmSync(home, { recursive: true, force: true }) }
})
