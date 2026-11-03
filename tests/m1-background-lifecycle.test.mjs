import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const binaries = [['rebuilt', 'bun', [join(root, 'dist/cli.js')]]]
if (process.env.CLAUDE_2310_X64) binaries.push(['official-x64', process.env.CLAUDE_2310_X64, []])

function execute(bin, prefix, args, env, cwd, timeout = 17000) {
  const result = spawnSync(bin, [...prefix, ...args], {
    cwd, env, timeout, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  })
  assert.equal(result.error, undefined, 'Launch failed: ' + result.error?.message)
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('2.1.310 background real lifecycle: dispatch, list, logs, stop, respawn, remove', { timeout: 170000 }, () => {
  for (const [name, bin, prefix] of binaries) {
    const home = mkdtempSync(join(tmpdir(), 'bg-lifecycle-'))
    const cwdDir = join(home, 'project')
    const config = join(home, 'config')
    mkdirSync(cwdDir, { recursive: true })
    mkdirSync(config, { recursive: true })
    // macOS resolves /var/... to /private/var/... during process.chdir().
    // Trust records must be keyed by the same canonical path the CLI observes.
    const cwd = realpathSync(cwdDir)
    writeFileSync(join(config, '.claude.json'), JSON.stringify({
      projects: { [cwd.replace(/\\/g, '/')]: { hasTrustDialogAccepted: true } },
    }))
    const env = {
      ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: config,
      XDG_CONFIG_HOME: join(home, 'xdg'),
      ANTHROPIC_API_KEY: 'sk-ant-test-0000000000000000',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:39099',
      DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', NO_COLOR: '1',
    }
    delete env.ANTHROPIC_AUTH_TOKEN
    try {
      const start = execute(bin, prefix, ['--bg', '--bare', 'say test'], env, cwd, 18000)
      assert.equal(start.status, 0, name + ' dispatch: ' + start.stderr + start.stdout)
      const match = /backgrounded · ([a-f0-9]{8})/.exec(start.stdout)
      assert.ok(match, name + ' missing id: ' + start.stdout)
      const id = match[1]
      const listed = execute(bin, prefix, ['agents', '--json'], env, cwd)
      assert.equal(listed.status, 0, name + ' list: ' + listed.stderr)
      const active = JSON.parse(listed.stdout)
      assert.equal(active.length, 1, name + ' list count')
      assert.equal(active[0].id, id)
      assert.equal(active[0].kind, 'background')
      assert.equal(active[0].cwd, cwd)
      assert.equal(active[0].name, 'say test')
      assert.equal(active[0].state, 'working')
      assert.equal(typeof active[0].startedAt, 'number')
      assert.ok(active[0].sessionId.startsWith(id + '-'))
      const logs = execute(bin, prefix, ['logs', id], env, cwd)
      assert.equal(logs.status, 0, name + ' logs: ' + logs.stderr)
      const stopped = execute(bin, prefix, ['stop', id], env, cwd)
      assert.equal(stopped.status, 0, name + ' stop: ' + stopped.stderr)
      assert.ok(stopped.stdout.includes('stopped ' + id))
      assert.deepEqual(JSON.parse(execute(bin, prefix, ['agents', '--json'], env, cwd).stdout), [])
      const all = JSON.parse(execute(bin, prefix, ['agents', '--json', '--all'], env, cwd).stdout)
      assert.equal(all.length, 1)
      assert.equal(all[0].state, 'stopped')
      const respawned = execute(bin, prefix, ['respawn', id], env, cwd)
      assert.equal(respawned.status, 0, name + ' respawn: ' + respawned.stderr)
      assert.ok(respawned.stdout.includes('respawned ' + id))
      const stoppedAgain = execute(bin, prefix, ['stop', id], env, cwd)
      assert.equal(stoppedAgain.status, 0, name + ' second stop: ' + stoppedAgain.stderr)
      const removed = execute(bin, prefix, ['rm', id], env, cwd)
      assert.equal(removed.status, 0, name + ' rm: ' + removed.stderr)
      assert.ok(removed.stdout.includes('removed ' + id))
      assert.deepEqual(JSON.parse(execute(bin, prefix, ['agents', '--json', '--all'], env, cwd).stdout), [])
    } finally {
      execute(bin, prefix, ['daemon', 'stop', '--any'], env, cwd, 10000)
      rmSync(home, { recursive: true, force: true })
    }
  }
})
