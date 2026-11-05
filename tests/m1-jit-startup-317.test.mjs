import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { jitPolicyFromEnv317, scheduleJitPolicy317, JIT_POLICY_DELAY_MS } from '../src/bootstrap/jitPolicy317.mjs'

const root = resolve(import.meta.dirname, '..')

test('M1 C19-T02: 317 JIT policy parsing matches the original integer descriptor 1..100', () => {
  for (const [raw, expected] of [
    [undefined, 1], ['', 1], ['0', 1], ['1', 1], ['09', 9],
    ['100', 100], ['101', 1], ['-1', 1], ['NaN', 1],
    ['2.0', 1], [' 3', 1], ['3 ', 1], ['3ms', 1], ['9999999999999999999999', 1],
  ]) assert.equal(jitPolicyFromEnv317(raw), expected, String(raw))
})

test('M1 C19-T02: normal CLI schedules one 10-second unref timer with official JIT argument', () => {
  let callback
  const scheduled = []
  const calls = []
  const schedule = (fn, ms) => {
    callback = fn
    const timer = { unref: () => calls.push('unref') }
    scheduled.push(ms)
    return timer
  }
  const bun = { unsafe: { setJITPolicy: value => calls.push(value) } }
  assert.equal(scheduleJitPolicy317({
    args: ['--print', 'prompt'],
    env: { CLAUDE_CODE_JIT_POLICY_AFTER_STARTUP: '17' },
    bun, schedule,
  }), true)
  assert.deepEqual(scheduled, [JIT_POLICY_DELAY_MS])
  assert.deepEqual(calls, ['unref'])
  callback()
  assert.deepEqual(calls, ['unref', 17])
})

test('M1 C19-T02: worker preload and spare routes do not schedule JIT policy', () => {
  for (const command of ['--preload', '--bg-spare']) {
    assert.equal(scheduleJitPolicy317({
      args: [command, '/tmp/socket'],
      schedule: () => { throw Error(command + ' incorrectly installed a startup timer') },
    }), false)
  }
})

test('M1 C19-T02: missing Bun JIT method leaves normal CLI usable', () => {
  let invoked = false
  const active = scheduleJitPolicy317({
    args: ['--help'], bun: {},
    schedule: (fn, timeout) => {
      assert.equal(timeout, 10_000)
      fn()
      return { unref: () => { invoked = true } }
    },
  })
  assert.equal(active, true)
  assert.equal(invoked, true)
})

test('M1 C19-T02: source start imports delayed JIT scheduler before full CLI initialization', () => {
  const entry = readFileSync(join(root, 'src/entrypoints/cli.tsx'), 'utf8')
  const start = entry.indexOf('scheduleJitPolicy317({ args })')
  const fullCli = entry.indexOf("await import('../main.js')")
  assert.ok(start > 0 && fullCli > start)
})
