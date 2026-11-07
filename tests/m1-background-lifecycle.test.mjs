import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const binaries = [['rebuilt', 'bun', [join(root, 'dist/cli.js')]]]
if (process.env.CLAUDE_TARGET_X64) binaries.push(['official-x64', process.env.CLAUDE_TARGET_X64, []])

function execute(bin, prefix, args, env, cwd, timeout = 17000) {
  const result = spawnSync(bin, [...prefix, ...args], {
    cwd, env, timeout, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  })
  assert.equal(result.error, undefined, `Launch failed: ${result.error?.message}`)
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

async function waitForAgents(bin,prefix,env,cwd,predicate,explanation,timeout=8000){
  const deadline=Date.now()+timeout
  let last
  while(Date.now()<deadline){
    const output=execute(bin,prefix,['agents','--json','--all'],env,cwd)
    assert.equal(output.status,0,'agents --all failed during '+explanation+': '+output.stderr)
    last=JSON.parse(output.stdout)
    if(predicate(last))return last
    await new Promise(done=>setTimeout(done,100))
  }
  assert.fail(explanation+' did not converge within '+timeout+'ms: '+JSON.stringify(last))
}

test('2.1.317 background real lifecycle: dispatch, list, logs, stop, respawn, remove', { timeout: 170000 }, async () => {
  for (const [name, bin, prefix] of binaries) {
    const home = mkdtempSync(join(tmpdir(), 'bg-lifecycle-'))
    const cwdDir = join(home, 'project')
    const config = join(home, 'config')
    mkdirSync(cwdDir, { recursive: true })
    mkdirSync(config, { recursive: true })
    // macOS resolves /var/... to /private/var/... during process.chdir().
    // Trust records must be keyed by the same canonical path the CLI observes.
    const cwd = realpathSync(cwdDir)
    writeFileSync(join(config, name === 'rebuilt' ? '.yaoyaoche.json' : '.claude.json'), JSON.stringify({
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
      assert.equal(start.status, 0, `${name} dispatch: ${start.stderr}${start.stdout}`)
      const match = /backgrounded · ([a-f0-9]{8})/.exec(start.stdout)
      assert.ok(match, `${name} missing id: ${start.stdout}`)
      const id = match[1]
      const listed = execute(bin, prefix, ['agents', '--json'], env, cwd)
      assert.equal(listed.status, 0, `${name} list: ${listed.stderr}`)
      const active = JSON.parse(listed.stdout)
      assert.equal(active.length, 1, `${name} list count`)
      assert.equal(active[0].id, id)
      assert.equal(active[0].kind, 'background')
      assert.equal(active[0].cwd, cwd)
      assert.equal(active[0].name, 'say test')
      assert.equal(active[0].state, 'working')
      assert.equal(typeof active[0].startedAt, 'number')
      assert.ok(active[0].sessionId.startsWith(`${id}-`))
      const logs = execute(bin, prefix, ['logs', id], env, cwd)
      assert.equal(logs.status, 0, `${name} logs: ${logs.stderr}`)
      const stopped = execute(bin, prefix, ['stop', id], env, cwd)
      assert.equal(stopped.status, 0, `${name} stop: ${stopped.stderr}`)
      assert.ok(stopped.stdout.includes(`stopped ${id}`))
      // Official 2.1.317 acknowledges stop before the daemon finalizes its
      // persisted state. Compare the eventual result on both binaries;
      // retain a strict deadline so a stuck process still fails this test.
      const stoppedItems=await waitForAgents(bin,prefix,env,cwd,
        items=>items.length===1&&items[0].id===id&&items[0].state==='stopped',
        name+' stop should persist a terminal state')
      assert.equal(stoppedItems[0].state,'stopped')
      assert.deepEqual(JSON.parse(execute(bin,prefix,['agents','--json'],env,cwd).stdout),[])
      const all = JSON.parse(execute(bin, prefix, ['agents', '--json', '--all'], env, cwd).stdout)
      assert.equal(all.length, 1)
      assert.equal(all[0].state, 'stopped')
      const respawned = execute(bin, prefix, ['respawn', id], env, cwd)
      assert.equal(respawned.status, 0, `${name} respawn: ${respawned.stderr}`)
      assert.ok(respawned.stdout.includes(`respawned ${id}`))
      const stoppedAgain = execute(bin, prefix, ['stop', id], env, cwd)
      assert.equal(stoppedAgain.status, 0, `${name} second stop: ${stoppedAgain.stderr}`)
      await waitForAgents(bin,prefix,env,cwd,
        items=>items.length===1&&items[0].id===id&&items[0].state==='stopped',
        name+' second stop should persist a terminal state')
      const removed = execute(bin, prefix, ['rm', id], env, cwd)
      assert.equal(removed.status, 0, `${name} rm: ${removed.stderr}`)
      assert.ok(removed.stdout.includes(`removed ${id}`))
      await waitForAgents(bin,prefix,env,cwd,items=>items.length===0,
        name+' removal must delete the record')
    } finally {
      const shutdown = execute(bin, prefix, ['daemon', 'stop', '--any'], env, cwd, 10000)
      assert.equal(shutdown.status, 0, `${name} daemon shutdown did not finish: ${shutdown.stderr}`)
      // Windows keeps cwd directories locked until every detached process
      // and its PTY worker have really exited; this must succeed immediately.
      rmSync(home, { recursive: true, force: true })
    }
  }
})
