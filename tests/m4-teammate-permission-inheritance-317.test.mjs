import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { teammatePermissionCliFlags317 } from '../src/utils/swarm/teammatePermissionMode317.ts'

const expected = [
  ['default', '--permission-mode default'],
  ['acceptEdits', '--permission-mode acceptEdits'],
  ['dontAsk', '--permission-mode dontAsk'],
  ['plan', '--permission-mode plan'],
  ['auto', '--permission-mode auto'],
  ['bypassPermissions', '--dangerously-skip-permissions'],
  ['bubble', '--permission-mode default'],
]
test('317#050 each leader permission mode is propagated explicitly', () => {
  for (const [mode, flag] of expected) {
    assert.equal(teammatePermissionCliFlags317(mode, false, false), flag, mode)
  }
})
test('317#050 explicit manual mode always wins over stale bypass environment', () => {
  assert.equal(teammatePermissionCliFlags317('default', false, true), '--permission-mode default')
  assert.equal(teammatePermissionCliFlags317('acceptEdits', false, true), '--permission-mode acceptEdits')
  assert.equal(teammatePermissionCliFlags317(undefined, false, true), '--dangerously-skip-permissions')
  assert.equal(teammatePermissionCliFlags317(undefined, false, false), '--permission-mode default')
})
test('317#050 plan-required mode takes precedence, including bypass and auto', () => {
  for (const mode of ['default', 'auto', 'bypassPermissions', undefined]) {
    assert.equal(teammatePermissionCliFlags317(mode, true, true), '--permission-mode plan')
  }
})
test('pane and shared teammate launch paths use the same permission implementation', () => {
  const util = readFileSync(new URL('../src/utils/swarm/spawnUtils.ts',import.meta.url),'utf8')
  const executor = readFileSync(new URL('../src/utils/swarm/backends/PaneBackendExecutor.ts',import.meta.url),'utf8')
  const spawn = readFileSync(new URL('../src/tools/shared/spawnMultiAgent.ts',import.meta.url),'utf8')
  assert.match(util,/flags\.push\(teammatePermissionCliFlags317\(/)
  assert.match(executor,/buildInheritedCliFlags\(/)
  assert.match(spawn,/import \{ buildInheritedCliFlags, buildInheritedEnvVars \} from/)
  assert.ok((spawn.match(/buildInheritedCliFlags\(/g)||[]).length>=2)
})
