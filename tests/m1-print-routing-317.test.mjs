import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPrintModeLaunch, isStreamJsonLaunch } from '../src/utils/cliArgv317.mjs'

test('2.1.317 CLI route only recognizes actual print-mode flags', () => {
  const cases = [
    [['-p', 'hello'], true],
    [['--print', 'hello'], true],
    [['--settings', '-p'], false],
    [['--prefill', '--print'], false],
    [['--', '-p'], false],
    [['--', '--print'], false],
    [['--settings', 'file.json', '--print'], true],
    [['-p', '--', '--settings', '--print'], true],
  ]
  for (const [argv, expected] of cases) {
    assert.equal(isPrintModeLaunch(argv), expected, JSON.stringify(argv))
  }
})

test('2.1.317 stream-json mode shares the same print-mode scanner', () => {
  // The official CLI also treats a non-TTY stdout as implicit headless mode.
  // A flag value named -p must not *add* print-mode semantics.
  assert.equal(isStreamJsonLaunch(['--settings', '-p', '--output-format', 'stream-json']), !process.stdout.isTTY)
  assert.equal(isStreamJsonLaunch(['--print', '--output-format', 'stream-json']), true)
  assert.equal(isStreamJsonLaunch(['--', '--print', '--output-format', 'stream-json']), false)
})
