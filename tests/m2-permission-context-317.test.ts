import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyFileFencePolicy } from '../src/utils/permissions/readFencePolicy.ts'
import type { ToolPermissionContext } from '../src/Tool.ts'

function context(): ToolPermissionContext {
  return { mode: 'default', additionalWorkingDirectories: new Map(), alwaysAllowRules: {}, alwaysDenyRules: {}, alwaysAskRules: {}, isBypassPermissionsModeAvailable: false }
}

test('317 file fence restrictions stay enabled after a settings reload and cannot narrow worktree state', () => {
  const initial = applyFileFencePolicy(context(), [{ permissions: { blockReadsOutsideWorkingDirectories: true, blockWritesOutsideWorkingDirectories: true } }])
  assert.equal(initial.blockReadsOutsideWorkingDirectories, true)
  assert.equal(initial.blockWritesOutsideWorkingDirectories, true)
  assert.deepEqual(initial.alwaysDenyRules.toolsNarrowing, ['EnterWorktree', 'ExitWorktree'])
  const reloaded = applyFileFencePolicy(initial, [{ permissions: { blockReadsOutsideWorkingDirectories: false, blockWritesOutsideWorkingDirectories: false } }])
  assert.equal(reloaded.blockReadsOutsideWorkingDirectories, true)
  assert.equal(reloaded.blockWritesOutsideWorkingDirectories, true)
  assert.deepEqual(reloaded.alwaysDenyRules.toolsNarrowing, ['EnterWorktree', 'ExitWorktree'])
  assert.equal(applyFileFencePolicy(context(), []).blockWritesOutsideWorkingDirectories, undefined)
})

test('317 context reload replaces flag exemptions and preserves pre-existing denials', () => {
  const prior = context()
  const approved = join(tmpdir(), 'approved')
  const fenced = applyFileFencePolicy({ ...prior, alwaysDenyRules: { cliArg: ['Bash'], toolsNarrowing: ['Read'] } }, [{ permissions: { blockWritesOutsideWorkingDirectories: true } }], [approved])
  assert.deepEqual(fenced.alwaysDenyRules.cliArg, ['Bash'])
  assert.deepEqual(fenced.alwaysDenyRules.toolsNarrowing, ['Read', 'EnterWorktree', 'ExitWorktree'])
  assert.deepEqual(fenced.readBlockExemptPaths, [approved])
  assert.deepEqual(applyFileFencePolicy(fenced, [], []).readBlockExemptPaths, [])
})

test('317 write-fence worktree restrictions reach the production deny-rule collector', async () => {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync('bun', ['-e', `
    import assert from 'node:assert/strict';
    import { getEmptyToolPermissionContext } from './src/Tool.ts';
    import { applyFileFencePolicy } from './src/utils/permissions/readFencePolicy.ts';
    import { getDenyRules } from './src/utils/permissions/permissions.ts';
    const context = applyFileFencePolicy(getEmptyToolPermissionContext(), [{ permissions: { blockWritesOutsideWorkingDirectories: true } }]);
    assert.deepEqual(getDenyRules(context).map(rule => rule.ruleValue.toolName), ['EnterWorktree', 'ExitWorktree']);
  `], { encoding: 'utf8', timeout: 20000 })
  assert.equal(result.status, 0, result.stderr)
})
