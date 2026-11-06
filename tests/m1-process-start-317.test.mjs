import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
// Query-suffixed imports must target the TypeScript implementation so each test receives isolated module state.
const fresh = async name => import('../src/bootstrap/processStart317.ts?' + name)

test('M1 317: official allocator flags preserve bitmask, decimal bounds, and disable booleans', async () => {
  const module = await fresh('allocator')
  module.noteProcessStartTuning({
    BUN_GC_TIMER_INTERVAL:'7', MIMALLOC_PURGE_HOLES_MIN_INTERVAL:'0',
    BUN_IDLE_GC_SECONDS:'', MIMALLOC_PURGE_DELAY:'0012345',
    BUN_JSC_useFTLJIT:'false', BUN_JSC_percentCPUPerMBForEdenTimer:'1',
    BUN_JSC_percentCPUPerMBForFullTimer:'1', BUN_GC_TIMER_DISABLE:'OFF',
  })
  assert.equal(module.processStartTuning(), 1+2+8+16+32+64)
  assert.equal(module.processStartPurgeDelayMs(), 12345)
  assert.equal(module.processStartCollectionTimerOff(), false)
  const invalid = await fresh('invalid')
  invalid.noteProcessStartTuning({MIMALLOC_PURGE_DELAY:'12345678',BUN_GC_TIMER_DISABLE:'yes'})
  // Official chunk-c3eav5v2.js sets the "configured" bit for every
  // truthy value before parsing its numeric validity. Invalid delay keeps
  // bit 3 while the parsed delay remains undefined.
  assert.equal(invalid.processStartTuning(), 1 << 3)
  assert.equal(invalid.processStartPurgeDelayMs(), undefined)
  assert.equal(invalid.processStartCollectionTimerOff(), true)
})

test('M1 317: process tuning captures the launch environment only once', async () => {
  const module = await fresh('once')
  module.noteProcessStartTuning({MIMALLOC_PURGE_DELAY:'10',BUN_GC_TIMER_DISABLE:'1'})
  module.noteProcessStartTuning({MIMALLOC_PURGE_DELAY:'30',BUN_GC_TIMER_DISABLE:'0'})
  assert.equal(module.processStartPurgeDelayMs(), 10)
  assert.equal(module.processStartCollectionTimerOff(), true)
})

test('M1 317: normal local execution does not start the remote GC profiler', async () => {
  const module = await fresh('disabled')
  module.startGarbageCollectionCount({
    CLAUDE_CODE_REMOTE:'false',CLAUDE_CODE_COUNT_GARBAGE_COLLECTIONS:'1'})
  module.noteFirstMessageForGarbageCollectionCount()
  assert.equal(module.takeGarbageCollectionCount(), undefined)
})

test('M1 317: remote GC profiles two phases and releases both collectors', async () => {
  const module = await fresh('remote')
  module.startGarbageCollectionCount({
    CLAUDE_CODE_REMOTE:'true',CLAUDE_CODE_COUNT_GARBAGE_COLLECTIONS:'1'})
  module.noteFirstMessageForGarbageCollectionCount()
  const first = module.takeGarbageCollectionCount()
  assert.ok(first, 'Expected GC profiling result')
  for (const phase of ['to_first_message','to_first_result']) {
    assert.ok(first[phase], phase + ' missing')
    for (const field of ['eden','full','wall_ms']) {
      assert.equal(Number.isSafeInteger(first[phase][field]), true, phase + ' ' + field)
      assert.ok(first[phase][field] >= 0)
    }
  }
  assert.equal(module.takeGarbageCollectionCount(), undefined,
    'GC profiling must be consumed exactly once')
})

test('M1 317: compiled executable terminates normally when remote GC is enabled', () => {
  const original = process.env.CLAUDE_REFERENCE_BIN
  const native = join(root, 'dist', process.platform === 'win32' ? 'claude.exe' : 'claude')
  const targets = [['rebuild',native]]
  if (original) targets.unshift(['official',original])
  for (const [label, executable] of targets) {
    const result = spawnSync(executable, ['--version'], {
      cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true,
      env: { ...process.env, CLAUDE_CODE_REMOTE:'true',
        CLAUDE_CODE_COUNT_GARBAGE_COLLECTIONS:'1',
        BUN_GC_TIMER_DISABLE:'1', MIMALLOC_PURGE_DELAY:'1000',
        DISABLE_TELEMETRY:'1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1' },
    })
    assert.equal(result.error, undefined, label + ' ' + String(result.error))
    assert.equal(result.status, 0, label + ' ' + result.stderr)
    assert.equal(result.stdout.trim(), '2.1.317 (333)')
  }
})
