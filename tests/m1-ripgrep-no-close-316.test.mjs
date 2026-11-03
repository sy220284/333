import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('2.1.316 embedded ripgrep returns a timeout error even if child never closes', () => {
  const s = readFileSync(new URL('../src/utils/ripgrep.ts', import.meta.url), 'utf8')
  const start = s.indexOf('killTimeoutId = setTimeout(() => {')
  const end = s.indexOf('}, 5_000)', start)
  assert.ok(start >= 0 && end > start)
  const deadline = s.slice(start, end)
  assert.match(deadline, /if \(settled\) return/)
  assert.match(deadline, /child\.kill\(process\.platform === 'win32' \? undefined : 'SIGKILL'\)/)
  assert.match(deadline, /settled = true/)
  assert.match(deadline, /error\.signal = 'SIGTERM'/)
  assert.match(deadline, /callback\(error, stdout, stderr\)/)
  assert.ok(deadline.indexOf('settled = true') < deadline.indexOf('callback(error, stdout, stderr)'))
})

test('late close or error events cannot duplicate the forced timeout callback', () => {
  const s = readFileSync(new URL('../src/utils/ripgrep.ts', import.meta.url), 'utf8')
  assert.match(s, /child\.on\('close', \(code, signal\) => \{\s*if \(settled\) return/)
  assert.match(s, /child\.on\('error', \(err: NodeJS\.ErrnoException\) => \{\s*if \(settled\) return/)
})
