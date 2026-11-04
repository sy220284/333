import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkRequiredFastPathVersion317, enforcesRequiredVersionForWorker317 } from '../src/bootstrap/fastPathSettings317.ts'

const version = '2.1.317'

test('2.1.317 organization minimum version gate is inclusive', () => {
  assert.equal(checkRequiredFastPathVersion317(version, { requiredMinimumVersion: version }), null)
  const rejection = checkRequiredFastPathVersion317(version, { requiredMinimumVersion: '2.1.318' })
  assert.match(rejection, /older than the minimum version required by your organization/)
  assert.match(rejection, /claude update/)
})

test('2.1.317 organization maximum version gate is inclusive', () => {
  assert.equal(checkRequiredFastPathVersion317(version, { requiredMaximumVersion: version }), null)
  const rejection = checkRequiredFastPathVersion317(version, { requiredMaximumVersion: '2.1.316' })
  assert.match(rejection, /newer than the maximum version allowed by your organization/)
  assert.match(rejection, /claude install <version>/)
})

test('2.1.317 organization gates are semver-aware and cannot be replaced by a false threshold', () => {
  assert.equal(checkRequiredFastPathVersion317(version, null), null)
  assert.equal(checkRequiredFastPathVersion317(version, {}), null)
  assert.equal(checkRequiredFastPathVersion317(version, {
    requiredMinimumVersion: 'v2.1.317+sha',
    requiredMaximumVersion: '2.1.318',
  }), null)
  assert.match(
    checkRequiredFastPathVersion317('2.1.317-beta.1', { requiredMinimumVersion: version }),
    /older than the minimum/,
  )
})

test('2.1.317 worker dispatch applies the same settings gate before four special handlers', () => {
  const path = fileURLToPath(new URL('../src/entrypoints/cli.tsx', import.meta.url))
  const source = readFileSync(path, 'utf8')
  for (const name of ['--bg-pty-host', '--daemon-worker', '--bg-spare', '--preload']) {
    const start = source.indexOf(`if (args[0] === '${name}')`)
    assert.ok(start >= 0, name + ' missing from runtime CLI')
    const firstHandler = source.slice(start, source.indexOf('return;', start) + 7)
    assert.match(firstHandler, /await ensureWorkerStartupPolicy\(/,
      name + ' bypasses managed startup policy')
  }
})

test('2.1.317 full version gate belongs to daemon-worker, not already-admitted warm/PTY hosts', () => {
  assert.equal(enforcesRequiredVersionForWorker317('--daemon-worker'), true)
  for (const route of ['--bg-pty-host', '--bg-spare', '--preload']) {
    assert.equal(enforcesRequiredVersionForWorker317(route), false, route)
  }
  const source = readFileSync(
    fileURLToPath(new URL('../src/entrypoints/cli.tsx', import.meta.url)), 'utf8')
  for (const route of ['--daemon-worker', '--bg-pty-host', '--bg-spare', '--preload'])
    assert.match(source, new RegExp('ensureWorkerStartupPolicy\\(\\x27' + route + '\\x27'),
      route + ' is not dispatched through the matching startup policy')
})
