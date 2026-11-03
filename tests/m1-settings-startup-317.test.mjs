import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { findUnobservedStartupChanges } from '../src/utils/settings/startupReconcile.mjs'

test('2.1.317: changed settings during watcher startup trigger reload', () => {
  const before = new Map([['/tmp/settings.json', 'old-digest']])
  const after = new Map([['/tmp/settings.json', 'new-digest']])
  assert.deepEqual(findUnobservedStartupChanges(before, after, new Set()),
    [{path: '/tmp/settings.json', kind: 'change'}])
})

test('2.1.317: file creation and deletion during initialization are not lost', () => {
  const before = new Map([['/tmp/a.json', null], ['/tmp/b.json', 'old']])
  const after = new Map([['/tmp/a.json', 'new'], ['/tmp/b.json', null]])
  assert.deepEqual(findUnobservedStartupChanges(before, after, new Set()), [
    {path:'/tmp/a.json',kind:'change'}, {path:'/tmp/b.json',kind:'delete'},
  ])
})

test('already delivered watcher changes are not replayed', () => {
  const before = new Map([['/tmp/settings.json', 'a']])
  const after = new Map([['/tmp/settings.json', 'b']])
  assert.deepEqual(findUnobservedStartupChanges(before, after,
    new Set(['/tmp/settings.json'])), [])
})

test('unchanged or unreadable files are not treated as changes', () => {
  assert.deepEqual(findUnobservedStartupChanges(
    new Map([['one','same'],['two',undefined]]),
    new Map([['one','same'],['two','changed']]),
    new Set()), [])
})

test('production code snapshots the raw content and performs startup reconciliation', () => {
  const source = readFileSync(new URL('../src/utils/settings/changeDetector.ts', import.meta.url),'utf8')
  const settings = readFileSync(new URL('../src/utils/settings/settings.ts', import.meta.url),'utf8')
  assert.match(source, /activeWatcher\.on\('ready',/)
  assert.match(source, /findUnobservedStartupChanges\(/)
  assert.match(settings, /setCachedSettingsFileDigest\(/)
})
