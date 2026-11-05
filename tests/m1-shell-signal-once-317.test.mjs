import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('2.1.317: abort, timeout and output limit all share an idempotent process-tree kill', () => {
  const src = readFileSync(new URL('../src/utils/ShellCommand.ts', import.meta.url), 'utf8')
  const method = src.split('  #doKill(code?: number): void {')[1]?.split('\n  kill(): void {')[0]
  assert.ok(method)
  assert.match(method, /if \(this\.#status === 'killed' \|\| this\.#status === 'completed'\) return/)
  assert.match(method, /this\.#status = 'killed'/)
  assert.equal((method.match(/treeKill\(/g) ?? []).length, 1)
  assert.equal((src.match(/this\.#doKill\(/g) ?? []).length >= 2, true)
})

test('2.1.317: backgrounding retains its previous behavior', () => {
  const src = readFileSync(new URL('../src/utils/ShellCommand.ts', import.meta.url), 'utf8')
  assert.match(src, /background\(taskId: string\): boolean/)
  assert.match(src, /this\.#status === 'running'/)
  assert.match(src, /this\.#status = 'backgrounded'/)
})
