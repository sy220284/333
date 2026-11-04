import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs'
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
function launch(binary, prefix, sock, configDir, auth, extraEnv = {}) {
  const child = spawn(binary, [...prefix, '--bg-spare', sock], {
    stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, CLAUDE_CONFIG_DIR: configDir,
      DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      ...(auth ? { CLAUDE_BG_CLAIM_AUTH: auth } : {}),
      ...extraEnv,
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

test('317 PTY host plus authenticated bg-spare forms one complete claim-to-output chain',
  { skip: process.platform === 'win32', timeout: 75000 }, async () => {
    const { createPtyFrameDecoder317, encodePtyControl317 } =
      await import('../src/bootstrap/ptyWire317.mjs')
    for (const [name, binary, prefix] of bins) {
      const dir = mkdtempSync(join(tmpdir(), '333-bg-spare-pty-'))
      const ptySocket = join(dir, 'worker.pty.sock')
      const claimSocket = join(dir, 'worker.claim.sock')
      const command = [binary, ...prefix, '--bg-spare', claimSocket]
      const host = spawn(binary, [...prefix, '--bg-pty-host', ptySocket,
        '80', '25', '--', ...command], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CLAUDE_CONFIG_DIR: dir,
          CLAUDE_BG_CLAIM_AUTH: 'spare-secret',
          DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      })
      let stderr = '', done = false, resultCode
      host.stderr.on('data', data => { stderr += data })
      const exit = new Promise(resolve => host.once('close', code => {
        resultCode = code; done = true; resolve()
      }))
      let client
      try {
        await until(() => (existsSync(claimSocket) && existsSync(ptySocket)) || done, 18000)
        assert.equal(done, false, name + ' host failed: ' + stderr)
        client = connect(ptySocket)
        let output = '', exited = false
        const controls = []
        const decode = createPtyFrameDecoder317(frame => {
          if (frame.kind === 0) output += frame.payload.toString('utf8')
          else {
            controls.push(frame.ctrl.t)
            if (frame.ctrl.t === 'ping') client.write(encodePtyControl317({ t: 'pong' }))
            if (frame.ctrl.t === 'exit') exited = true
          }
        }, reason => { throw Error(name + ' bad frame: ' + reason) })
        client.on('data', decode)
        await claim(claimSocket, { cwd: dir, env: {}, argv: ['--version'], auth: 'spare-secret' })
        await until(() => exited || done, 15000)
        await Promise.race([exit,
          new Promise((_, reject) => setTimeout(() => reject(Error(name + ' integrated host hung')), 12000))])
        assert.equal(resultCode, 0, name + ' ' + stderr)
        assert.ok(output.includes('2.1.317 (Claude Code)'), name + ' ' + output)
        for (const event of ['hello', 'live', 'ping', 'exit'])
          assert.ok(controls.includes(event), name + ' missing ' + event + ' ' + JSON.stringify(controls))
        await until(() => !existsSync(claimSocket) && !existsSync(ptySocket))
      } finally {
        client?.destroy()
        if (!done) host.kill('SIGKILL')
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

test('317 spare refuses missing or malformed explicit claim-token files before opening a socket',
  { skip: process.platform === 'win32', timeout: 18000 }, () => {
    for (const payload of [null, '{bad json', '{"claimAuth":""}', '{"claimAuth":42}']) {
      const dir = mkdtempSync(join(tmpdir(), '333-bgspare-token-fail-'))
      const tokens = join(dir, 'tokens.json'), socket = join(dir, 'claim.sock')
      try {
        if (payload !== null) writeFileSync(tokens, payload, { mode: 0o600 })
        const result = spawnSync('bun', [cli, '--bg-spare', socket], {
          encoding: 'utf8', timeout: 10000,
          env: {
            ...process.env, CLAUDE_CONFIG_DIR: dir,
            CLAUDE_BG_SOCKET_TOKENS_PATH: tokens,
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
          },
        })
        assert.ifError(result.error)
        assert.equal(result.status, 1, result.stderr)
        assert.match(result.stderr, /claim tokens unavailable:/)
        assert.equal(existsSync(socket), false, 'unverified tokens opened a claim listener')
        assert.equal(existsSync(tokens), false, 'one-time token file remained on disk')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

test('317 authenticated spare rejects malformed claims and preserves its one-shot handoff',
  { skip: process.platform === 'win32', timeout: 30000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), '333-bgspare-claim-validation-'))
    const tokens = join(dir, 'tokens.json'), socket = join(dir, 'claim.sock')
    writeFileSync(tokens, JSON.stringify({ claimAuth: 'trusted-claim' }), { mode: 0o600 })
    const started = launch('bun', [cli], socket, dir, undefined, {
      CLAUDE_BG_SOCKET_TOKENS_PATH: tokens,
    })
    try {
      await until(() => existsSync(socket) || started.isClosed())
      assert.equal(started.isClosed(), false, 'valid token prevented startup')
      assert.equal(existsSync(tokens), false, 'one-time token was not removed')
      await claim(socket, { auth: 'trusted-claim', cwd: dir, env: [], argv: ['--version'] })
      await claim(socket, { auth: 'trusted-claim', cwd: join(dir, 'missing'), env: {}, argv: ['--version'] })
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(started.isClosed(), false, 'invalid startup state consumed the worker')
      assert.equal(existsSync(socket), true)
      await claim(socket, { auth: 'trusted-claim', cwd: dir, env: {}, argv: ['--version'] })
      const result = await Promise.race([started.done,
        new Promise((_, reject) => setTimeout(() => reject(Error('valid claim timed out')), 12000))])
      assert.equal(result.code, 0, JSON.stringify(result))
      assert.equal(result.stdout.trim(), '2.1.317 (Claude Code)')
      assert.equal(existsSync(socket), false)
    } finally {
      started.child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  })
