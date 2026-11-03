import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  SHORT_ID_PATTERN, MAX_LOG_BYTES, fleetHome, fleetSocket, createSessionRecord,
  saveSession, reserveNewSession, editSession, readSession, listSessions, matchSession, readTail,
  stripUnsafeTerminal, worktreeDigest, removeWorktreeSafely
} from '../src/cli/background/sessionStore.mjs'

const root = resolve(import.meta.dirname, '..')
function snapshotCmd(bin, prefix, args, env) {
  const proc = spawnSync(bin, [...prefix, ...args], { cwd: root, env, encoding: 'utf8', timeout: 15000 })
  assert.equal(proc.error, undefined, proc.error?.message)
  return { code: proc.status, out: proc.stdout.trim(), err: proc.stderr.trim() }
}
function sandboxEnv(dir) {
  const env = {
    ...process.env, HOME: dir, USERPROFILE: dir, CLAUDE_CONFIG_DIR: join(dir, 'config'),
    XDG_CONFIG_HOME: join(dir, 'xdg'), DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', NO_COLOR: '1',
  }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.ANTHROPIC_BASE_URL
  return env
}
test('2.1.310 background IDs, bounded tail and terminal sanitization match the documented protocol', async () => {
  assert.equal(SHORT_ID_PATTERN.test('abcdef09'), true)
  assert.equal(SHORT_ID_PATTERN.test('abcdef09a'), false)
  assert.equal(MAX_LOG_BYTES, 1024 * 1024)
  assert.equal(stripUnsafeTerminal('hi\u001b]0;unsafe\u0007 there\u001b[31m red'), 'hi there\u001b[31m red')
  const tmp = await mkdtemp(join(tmpdir(), 'bg-state-'))
  const env = sandboxEnv(tmp)
  try {
    const a = createSessionRecord({ id: '12345678', sessionId: '12345678-1111-4111-8111-111111111111', argv: ['hello'], cwd: tmp, name: 'First agent', env })
    const b = createSessionRecord({ id: '12345670', sessionId: '12345670-2222-4222-8222-222222222222', argv: [], cwd: tmp, name: 'Second agent', env })
    assert.equal(a.id, '12345678')
    assert.equal(a.kind, 'background')
    assert.equal(typeof a.startedAt, 'number')
    await saveSession(a, env)
    await saveSession(b, env)
    const rec = await readSession('12345678', env)
    assert.equal(rec.name, 'First agent')
    const changed = await editSession(a.id, { state: 'stopped', pid: null, detail: 'stopped' }, env)
    assert.equal(changed.detail, 'stopped')
    const all = await listSessions({ all: true, env })
    assert.equal(all.length, 2)
    assert.deepEqual(await listSessions({ env }), [])
    assert.equal(matchSession(all, '12345678').id, a.id)
    assert.equal(matchSession(all, 'second').id, b.id)
    assert.throws(() => matchSession(all, '1234567'), /Ambiguous prefix/)
    assert.throws(() => matchSession(all, 'missing'), /No job matching/)
    const logPath = join(tmp, 'long.log')
    await writeFile(logPath, 'x'.repeat(MAX_LOG_BYTES + 100))
    const tail = await readTail(logPath)
    assert.equal(Buffer.byteLength(tail), MAX_LOG_BYTES)
    if (process.platform !== 'win32') {
      assert.equal((await stat(join(fleetHome(env), 'jobs'))).mode & 0o077, 0)
    }
    assert.ok(fleetSocket(env).endsWith('control.sock') || fleetSocket(env).includes('claude-bg'))
  } finally { await rm(tmp, { recursive: true, force: true }) }
})
test('new background session creation never overwrites a colliding short id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bg-collision-'))
  const env = sandboxEnv(dir)
  try {
    const first = createSessionRecord({
      id: 'cafebabe', sessionId: 'cafebabe-1111-4111-8111-111111111111',
      argv: ['one'], cwd: dir, name: 'original', env,
    })
    const collision = createSessionRecord({
      id: 'cafebabe', sessionId: 'cafebabe-2222-4222-8222-222222222222',
      argv: ['two'], cwd: dir, name: 'collision', env,
    })
    await reserveNewSession(first, env)
    await assert.rejects(reserveNewSession(collision, env), { code: 'EEXIST' })
    const preserved = await readSession('cafebabe', env)
    assert.equal(preserved.name, 'original')
    assert.equal(preserved.sessionId, first.sessionId)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('2.1.310 background worktree removal requires actual git safety evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bg-worktree-'))
  try {
    const folder = join(dir, 'worktree')
    await mkdir(folder)
    assert.match(worktreeDigest(folder), /^[a-f0-9]{12}$/)
    await assert.rejects(removeWorktreeSafely(folder), /Cannot inspect worktree/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('installed official x64 and rebuilt CLI expose 2.1.310 background command behaviors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bg-cli-oracle-'))
  const env = sandboxEnv(dir)
  await mkdir(env.CLAUDE_CONFIG_DIR, { recursive: true })
  const targets = [['rebuilt', 'bun', [join(root, 'dist/cli.js')]]]
  if (process.env.CLAUDE_2310_X64) targets.push(['official x64', process.env.CLAUDE_2310_X64, []])
  try {
    for (const [name, command, prefix] of targets) {
      const agents = snapshotCmd(command, prefix, ['agents', '--json'], env)
      assert.equal(agents.code, 0, `${name}: ${agents.err}`)
      assert.deepEqual(JSON.parse(agents.out), [], `${name}: expected no sessions`)
      const finished = snapshotCmd(command, prefix, ['agents', '--json', '--all'], env)
      assert.equal(finished.code, 0, `${name}: ${finished.err}`)
      assert.deepEqual(JSON.parse(finished.out), [])
      for (const [verb, synopsis] of [['agents', 'Manage background agents'], ['attach', 'attach'], ['logs', 'logs'], ['stop', 'stop'], ['respawn', 'respawn'], ['rm', 'rm']]) {
        const help = snapshotCmd(command, prefix, [verb, '--help'], env)
        assert.equal(help.code, 0, `${name} ${verb}: ${help.err}`)
        assert.ok(help.out.includes(synopsis), `${name} ${verb}: bad help`)
      }
      const status = snapshotCmd(command, prefix, ['daemon', 'status'], env)
      assert.equal(status.code, 1, `${name}: daemon status should fail when absent`)
      assert.match(status.out + status.err, /not running/)
      // Native 2.1.310 stop is idempotent when no daemon was started.
      for (const args of [['daemon', 'stop'], ['daemon', 'stop', '--any']]) {
        const stopped = snapshotCmd(command, prefix, args, env)
        assert.equal(stopped.code, 0, `${name}: ${args.join(' ')} returned ${stopped.err}`)
        assert.match(stopped.out, /no daemon running/)
      }
      for (const verb of ['stop', 'logs', 'attach']) {
        const missing = snapshotCmd(command, prefix, [verb, 'abcdef98'], env)
        assert.equal(missing.code, 1, `${name}: missing ${verb}`)
        assert.match(missing.out + missing.err, /No job matching/)
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('retired ps/bg private dispatch cannot override the new daemon and agent fleet', async () => {
  const src = await readFile(join(root, 'src/entrypoints/cli.tsx'), 'utf8')
  const main = await readFile(join(root, 'src/main.tsx'), 'utf8')
  assert.match(src, /interceptBackgroundCli/)
  assert.doesNotMatch(src, /daemon\/main\.js|cli\/bg\.js|BG_SESSIONS/)
  assert.match(main, /program\.option\('--bg, --background'/)
  assert.match(main, /program\.command\('agents'\)\.description\('Manage background agents'\)/)
  assert.match(main, /program\.command\('daemon \[subcommand\]'\)/)
})
