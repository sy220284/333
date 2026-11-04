import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { computeAutoDependencyOrphans as scan } from '../src/utils/plugins/autoDependencyPrune.mjs'

function item(auto = false, scope = 'user', projectPath) {
  return { scope, projectPath, auto, installPath: '/tmp/plugin-fixture' }
}
function plugin(source, dependencies = []) { return { source, manifest: { dependencies } } }

test('317 prune empty or manual-only registry has no automatic removal candidates', () => {
  assert.deepEqual([...scan({}, [], 'user').orphans], [])
  const r = scan({ 'manual@shop': [item(false)] }, [plugin('manual@shop')], 'user')
  assert.equal(r.autoCount, 0)
})
test('317 prune computes full reachable closure from all manual roots', () => {
  const records = {
    'root@shop': [item(false)],
    'dep@shop': [item(true)],
    'nested@shop': [item(true)],
    'orphan@shop': [item(true)],
  }
  const loaded = [plugin('root@shop',['dep']), plugin('dep@shop',['nested']), plugin('nested@shop'), plugin('orphan@shop')]
  const result = scan(records,loaded,'user')
  assert.deepEqual([...result.orphans], ['orphan@shop'])
  assert.equal(result.autoCount,3)
})
test('317 explicit manual installation never becomes an auto removal candidate', () => {
  const records = { 'manual@shop': [item(false)], 'orphan@shop': [item(true)] }
  const result = scan(records,[plugin('manual@shop'),plugin('orphan@shop')],'user')
  assert.deepEqual([...result.orphans], ['orphan@shop'])
})
test('317 unloaded plugin disables all pruning even if a separate orphan exists', () => {
  const records = { 'root@shop': [item(false)], 'orphan@shop': [item(true)] }
  const result = scan(records,[plugin('orphan@shop')],'user')
  assert.deepEqual([...result.orphans], [])
  assert.deepEqual(result.unloadable,['root@shop'])
})
test('317 prune scope and project path isolate unrelated installations', () => {
  const records = { 'root@shop': [item(false,'project','/repo')], 'extra@shop':[item(true,'project','/repo'),item(false,'local','/repo')] }
  const loaded = [plugin('root@shop'),plugin('extra@shop')]
  assert.deepEqual([...scan(records,loaded,'project','/repo').orphans], ['extra@shop'])
  assert.equal(scan(records,loaded,'local','/repo').autoCount,0)
  assert.equal(scan(records,loaded,'project','/other').autoCount,0)
})
test('317 plugin prune --yes empty scope runs actual compiled CLI', () => {
  const dir=mkdtempSync(join(tmpdir(),'pr7-prune-'))
  try {
    const proc=spawnSync('bun',[resolve(import.meta.dirname,'../dist/cli.js'),'plugin','prune','--yes'],{
      cwd:resolve(import.meta.dirname,'..'),
      env:{...process.env,CLAUDE_CONFIG_DIR:dir,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_TELEMETRY:'1'},
      encoding:'utf8',timeout:15000,
    })
    assert.equal(proc.status,0,proc.stderr)
    assert.match(proc.stdout,/Nothing to prune \(no auto-installed plugins at user scope\)/)
  } finally {
    rmSync(dir,{recursive:true,force:true})
  }
})
