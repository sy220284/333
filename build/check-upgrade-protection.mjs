#!/usr/bin/env node
/**
 * PR13/PR14 升级成果保护门禁。仅使用 Node 内置模块，可在安装依赖前执行。
 * 权威历史快照：docs/upgrade/pr13-upgrade-protection-baseline.json。
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const exact = (value, fallback = null) => value === undefined ? fallback : value

export function validateUpgradeProtection({ baseline, release, development, stable, toolchain, inventory, routes, updates, approvals = baseline.approvedChanges }) {
  const errors = []
  const fail = message => errors.push(message)
  const approved = (scope, key, before, after) => {
    const rule = approvals.find(x => x.scope === scope && x.key === key && x.before === before && x.after === after)
    if (!rule) return false
    if (typeof rule.technicalBasis !== 'string' || rule.technicalBasis.trim().length < 20 ||
        typeof rule.replacementCoverage !== 'string' || rule.replacementCoverage.trim().length < 20 ||
        !Array.isArray(rule.tests) || !rule.tests.length ||
        rule.tests.some(x => typeof x !== 'string' || !x.startsWith('tests/')) ||
        typeof rule.evidence !== 'string' || !/^https:\/\//.test(rule.evidence)) {
      fail(`变更批准信息不完整：${scope} ${key}；需要技术依据、能力覆盖、测试和真实证据`)
      return false
    }
    for (const test of rule.tests) if (!existsSync(resolve(root, test))) fail(`批准变更测试文件不存在：${test}`)
    return true
  }
  const match = (scope, key, before, after) => {
    if (before === after) return
    if (!approved(scope, key, before, after)) fail(`升级基准变化需审核：${scope} ${key} ${before ?? '无'} -> ${after ?? '无'}`)
  }
  if (baseline.schema !== 1 || baseline.source.release !== '2.1.317') fail('升级成果快照格式或目标版本不匹配')
  if (!Array.isArray(approvals)) fail('approvedChanges 必须是可审计数组')
  const rootDirect = release.packages?.['']?.dependencies ?? {}
  const snapshotDirect = baseline.dependencies.direct
  for (const name of new Set([...Object.keys(snapshotDirect), ...Object.keys(rootDirect)])) {
    match('release-direct', name, exact(snapshotDirect[name]), exact(rootDirect[name]))
  }
  const activeRelease = Object.fromEntries(Object.entries(release.packages ?? {})
    .filter(([name]) => name !== '')
    .map(([name, pkg]) => [name, { version: pkg.version, integrity: pkg.integrity, resolved: pkg.resolved }]))
  const checkInstalled = (kind, snapshot, active) => {
    for (const path of new Set([...Object.keys(snapshot), ...Object.keys(active)])) {
      const before = snapshot[path] ?? {}
      const after = active[path] ?? {}
      for (const field of ['version', 'integrity', 'resolved']) {
        match(kind, `${path}#${field}`, exact(before[field]), exact(after[field]))
      }
    }
  }
  checkInstalled('release-installed', baseline.dependencies.installed, activeRelease)
  const activeDevelopment = Object.fromEntries(Object.entries(development.packages ?? {})
    .filter(([name]) => name !== '')
    .map(([name, pkg]) => [name, { version: pkg.version, integrity: pkg.integrity, resolved: pkg.resolved }]))
  checkInstalled('development-installed', baseline.dependencies.development, activeDevelopment)
  const rawRelease = readFileSync(resolve(root, baseline.dependencies.releaseLock))
  const calculatedSha = createHash('sha1').update(`blob ${rawRelease.length}\0`).update(rawRelease).digest('hex')
  match('release-lock', baseline.dependencies.releaseLock, baseline.dependencies.releaseBlobSha, calculatedSha)
  if (release.packages?.['']?.version !== baseline.source.release) fail('发行版本意外变化')
  if (toolchain.runtimes.node !== baseline.upgradedContracts.node) {
    match('runtime', 'node', baseline.upgradedContracts.node, toolchain.runtimes.node)
  }
  if (toolchain.development.packages.typescript !== baseline.upgradedContracts.typescript) {
    match('runtime', 'typescript', baseline.upgradedContracts.typescript, toolchain.development.packages.typescript)
  }
  for (const [name, version] of Object.entries(baseline.upgradedContracts.mcpV2)) {
    if (rootDirect[name] !== version) match('mcp-v2', name, version, rootDirect[name] ?? null)
    if (stable.versions[name] !== rootDirect[name]) fail(`公共升级清单与 MCP v2 当前版本不一致：${name}`)
    if (activeRelease[`node_modules/${name}`]?.version !== rootDirect[name]) fail(`MCP v2 实际安装版本与依赖声明不一致：${name}`)
  }
  const verifyInventory = (type, expected) => {
    const items = inventory[type]
    if (!Array.isArray(items)) { fail(`缺少能力目录：${type}`); return }
    const ids = items.map(item => item.id)
    if (new Set(ids).size !== ids.length) fail(`能力目录存在重复编号：${type}`)
    for (const id of expected) if (!ids.includes(id)) fail(`升级成果缺失：${type} ${id}`)
  }
  if (inventory.target_version !== baseline.capabilities.version) fail('能力对照目标版本发生变化')
  verifyInventory('features', baseline.capabilities.featureIds)
  verifyInventory('scenarios', baseline.capabilities.scenarioIds)
  const verifyIndexed = (label, entries, expected) => {
    if (!Array.isArray(entries)) { fail(`升级保护缺少 ${label} 索引`); return }
    const ids = entries.map(x => x.id)
    if (new Set(ids).size !== ids.length) fail(`升级保护存在重复编号：${label}`)
    for (const id of expected) if (!ids.includes(id)) fail(`升级成果缺失：${label} ${id}`)
  }
  if (routes?.target_version !== baseline.source.release || updates?.target_version !== baseline.source.release) {
    fail('主功能链或增量更新的目标版本发生变化')
  }
  verifyIndexed('routes', routes?.routes, baseline.capabilities.routeIds)
  verifyIndexed('incrementalUpdates', updates?.items, baseline.capabilities.updateIds)
  for (const path of [...baseline.upgradedContracts.testFiles, ...baseline.capabilities.mapping, baseline.capabilities.routeInventory, baseline.capabilities.updateInventory]) {
    if (!existsSync(resolve(root, path))) fail(`保护基准引用的真实文件不存在：${path}`)
  }
  if (baseline.evidence.platforms.length !== 6 || !baseline.evidence.sixArch?.startsWith('https://github.com/')) {
    fail('六发行架构验收证据索引缺失')
  }
  return errors
}

export function checkUpgradeProtection() {
  // 锁住历史快照自身，避免修改比较基准后意外放行依赖降级。
  const toolchain = read('tools/dev/toolchain.lock.json')
  const baselineBytes = readFileSync(resolve(root, 'docs/upgrade/pr13-upgrade-protection-baseline.json'))
  const header = 'blob ' + baselineBytes.length + String.fromCharCode(0)
  const baselineBlobSha = createHash('sha1').update(header).update(baselineBytes).digest('hex')
  if (baselineBlobSha !== toolchain.integrity.pr13BaselineBlobSha) {
    throw new Error('PR13 历史升级基准指纹不符；更新快照须同步提交权威清单供审核')
  }
  const baseline = JSON.parse(baselineBytes.toString('utf8'))
  const errors = validateUpgradeProtection({
    baseline,
    release: read(baseline.dependencies.releaseLock),
    development: read(baseline.dependencies.developmentLock),
    stable: read('docs/upgrade/latest-stable-dependencies.json'),
    toolchain: read('tools/dev/toolchain.lock.json'),
    inventory: read(baseline.capabilities.inventory),
    routes: read(baseline.capabilities.routeInventory),
    updates: read(baseline.capabilities.updateInventory),
  })
  if (errors.length) throw new Error(`升级成果回退保护失败（${errors.length} 项）:\n${errors.join('\n')}`)
  return baseline
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const b = checkUpgradeProtection()
  console.log(`PR13 升级成果已核对：${Object.keys(b.dependencies.direct).length} 项直接依赖、${Object.keys(b.dependencies.installed).length} 项安装依赖、${b.capabilities.featureIds.length} 项功能、${b.capabilities.scenarioIds.length} 个场景、${b.capabilities.routeIds.length} 条功能链、${b.capabilities.updateIds.length} 项增量更新；MCP v2 与锁文件保持一致`)
}
