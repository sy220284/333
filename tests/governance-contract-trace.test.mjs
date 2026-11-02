import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import test from 'node:test'

const location = process.argv[2]
assert.ok(location, '必须指定同一次治理运行生成的 missing-contracts.json')
const report = JSON.parse(readFileSync(location, 'utf8'))
const entries = new Map(report.entries.map(entry => [entry.target, entry]))
const counts = {
  'runtime-required': 0,
  'build-excluded': 0,
  'type-only': 0,
  'not-found-in-current-src': 0,
}
for (const entry of report.entries) {
  assert.ok(Object.hasOwn(counts, entry.kind), `未知缺口分类 ${entry.kind}`)
  counts[entry.kind]++
  assert.ok(entry.provenExcludedSites <= entry.runtimeSites, entry.target)
  if (entry.kind === 'build-excluded') {
    assert.ok(entry.runtimeSites > 0, `无动态引用却误报已剔除：${entry.target}`)
    assert.equal(entry.runtimeSites, entry.provenExcludedSites, entry.target)
  }
  if (entry.kind === 'runtime-required') {
    assert.ok(entry.runtimeSites > entry.provenExcludedSites, entry.target)
  }
}

test('所有缺口按真实编译和导入类型互斥分类', () => {
  assert.equal(report.summary.total, report.entries.length)
  assert.equal(report.summary.runtimeRequired, counts['runtime-required'])
  assert.equal(report.summary.buildExcluded, counts['build-excluded'])
  assert.equal(report.summary.typeOnly, counts['type-only'])
  assert.equal(report.summary.unreferenced, counts['not-found-in-current-src'])
  assert.equal(Object.values(counts).reduce((a, n) => a + n, 0), report.summary.total)
})

test('正式 production 构建不能把 Ink Devtools 误报为运行缺失', () => {
  const devtools = entries.get('src/ink/devtools.ts')
  if (devtools) {
    assert.equal(devtools.kind, 'build-excluded')
    assert.equal(devtools.runtimeSites, devtools.provenExcludedSites)
  }
})

test('已关闭的旧内部门控不可冒充真实运行依赖', () => {
  for (const target of [
    'src/assistant/index.ts',
    'src/proactive/index.ts',
    'src/tasks/MonitorMcpTask/MonitorMcpTask.ts',
  ]) {
    const entry = entries.get(target)
    if (!entry) continue
    assert.equal(entry.kind, 'build-excluded', target)
  }
})

test('无法判定可达性的外部电脑和浏览器依赖保留待验收', () => {
  for (const target of ['@ant/computer-use-mcp', '@ant/claude-for-chrome-mcp']) {
    const entry = entries.get(target)
    if (!entry) continue
    assert.equal(entry.kind, 'runtime-required', target)
  }
})
