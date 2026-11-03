import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { acquireHookPermit, limitHookGenerator } from '../src/utils/hooks/hookConcurrency.mjs'

test('twenty-four prompt hooks run; next hook waits until a slot is released', async () => {
  const release = await Promise.all(Array.from({length: 24}, () => acquireHookPermit('hook-test-24', 30000)))
  let started = false
  const waiting = acquireHookPermit('hook-test-24', 30000).then(fn => {
    started = true
    return fn
  })
  await Promise.resolve()
  assert.equal(started, false)
  release[0]()
  const extra = await waiting
  assert.equal(started, true)
  extra()
  for (const fn of release.slice(1)) fn()
})

test('after at least one second, 12 overdue hooks can run but the 13th still waits', async () => {
  const id = 'hook-test-overdue'
  const active = await Promise.all(Array.from({length: 24}, () => acquireHookPermit(id, 1000)))
  let overdue = 0
  const waiting = Array.from({length: 13}, () =>
    acquireHookPermit(id, 1).then(release => {
      overdue++
      return release
    }),
  )
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(overdue, 0)
  await new Promise(resolve => setTimeout(resolve, 1010))
  assert.equal(overdue, 12)
  active[0]()
  const acquired = await Promise.all(waiting)
  for (const release of acquired) release()
  for (const release of active.slice(1)) release()
})

test('aborted queued hooks are removed and cannot leak a permit', async () => {
  const id='hook-test-abort'
  const active=await Promise.all(Array.from({length:24},()=>acquireHookPermit(id,30000)))
  const cancel=new AbortController()
  const pending=acquireHookPermit(id,30000,cancel.signal)
  cancel.abort()
  const release=await pending
  release()
  for(const fn of active) fn()
  const fresh=await acquireHookPermit(id,30000)
  fresh()
})

test('all Hook execution paths use the shared limiter', () => {
  const text=readFileSync(new URL('../src/utils/hooks.ts', import.meta.url),'utf8')
  assert.match(text,/for await \(const result of all\(limitedHooks\)\)/)
  assert.match(text,/limitHookGenerator\(generator, getSessionId\(\), waitMs, signal\)/)
  assert.match(text,/await acquireHookPermit\(/)
  assert.match(text,/releaseHookPermit\?\.\(\)/)
})

test('cancelled queued generator never starts its underlying hook', async () => {
  const id = 'hook-test-queued-cancel'
  const active = await Promise.all(Array.from({length:24},()=>acquireHookPermit(id,30000)))
  const ctl = new AbortController()
  let executions=0
  async function* original() { executions++; yield 'unexpected' }
  const pending = limitHookGenerator(original(), id, 30000, ctl.signal).next()
  await Promise.resolve()
  ctl.abort()
  assert.equal((await pending).done, true)
  assert.equal(executions, 0)
  active.forEach(release => release())
})
