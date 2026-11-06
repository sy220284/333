import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { checkUpgradeProtection, validateUpgradeProtection } from '../build/check-upgrade-protection.mjs'

const root = resolve(import.meta.dirname, '..')
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const baseline = read('docs/upgrade/pr13-upgrade-protection-baseline.json')
const original = () => ({
  baseline,
  release: read('build/public-dependencies.lock.json'),
  development: read('tools/dev/package-lock.json'),
  stable: read('docs/upgrade/latest-stable-dependencies.json'),
  toolchain: read('tools/dev/toolchain.lock.json'),
  inventory: read('docs/upgrade/2.1.317-功能与场景源数据.json'),
  routes: read(baseline.capabilities.routeInventory),
  updates: read(baseline.capabilities.updateInventory),
})

test('PR13 直接依赖、510 项传递安装记录、TypeScript 7 与 MCP v2 不漂移', () => {
  assert.equal(checkUpgradeProtection().source.pr, 13)
  assert.deepEqual(validateUpgradeProtection(original()), [])
})

test('生产依赖直接降级和 MCP v2 替换均被拦截', () => {
  const state = original()
  state.release.packages[''].dependencies['@modelcontextprotocol/client'] = '1.0.0'
  const errors = validateUpgradeProtection(state)
  assert.ok(errors.some(x => x.includes('release-direct') && x.includes('@modelcontextprotocol/client')))
  assert.ok(errors.some(x => x.includes('mcp-v2') && x.includes('@modelcontextprotocol/client')))
})

test('传递依赖版本或 tarball 完整性发生改变会被拦截', () => {
  const state = original()
  const item = Object.keys(state.baseline.dependencies.installed)[0]
  state.release.packages[item].integrity = 'sha512-unverified'
  const errors = validateUpgradeProtection(state)
  assert.ok(errors.some(x => x.includes(item) && x.includes('#integrity')))
})

test('功能与场景已确认编号不得被覆盖或删除', () => {
  const state = original()
  state.inventory.features = state.inventory.features.filter(x => x.id !== 'F001')
  state.inventory.scenarios = state.inventory.scenarios.filter(x => x.id !== 'E01')
  const errors = validateUpgradeProtection(state)
  assert.ok(errors.some(x => x.includes('features F001')))
  assert.ok(errors.some(x => x.includes('scenarios E01')))
})

test('缺少完整技术依据或真实测试证据的升级批准不能绕过保护', () => {
  const state = original()
  const item = Object.keys(state.baseline.dependencies.installed)[0]
  const oldVersion = state.baseline.dependencies.installed[item].version
  state.release.packages[item].version = '0.0.1'
  state.baseline = { ...baseline, approvedChanges: [{
    scope: 'release-installed', key: `${item}#version`, before: oldVersion, after: '0.0.1',
    technicalBasis: '临时修改', replacementCoverage: '', tests: [], evidence: '',
  }] }
  assert.ok(validateUpgradeProtection(state).some(x => x.includes('批准信息不完整')))
})

test('20条主功能链与366项增量更新的既有编号不得丢失', () => {
  const state = original()
  state.routes.routes = state.routes.routes.filter(x => x.id !== 'C01')
  const removed = state.baseline.capabilities.updateIds[0]
  state.updates.items = state.updates.items.filter(x => x.id !== removed)
  const errors = validateUpgradeProtection(state)
  assert.ok(errors.some(x => x.includes('routes C01')))
  assert.ok(errors.some(x => x.includes(`incrementalUpdates ${removed}`)))
})
