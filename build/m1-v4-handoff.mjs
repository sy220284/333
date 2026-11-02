#!/usr/bin/env node
/**
 * M1 v4：把原版 x64 与当前源码的实际命令差分转换为可执行开发交接。
 *
 * 与严格等价验收分离：这里成功只表示差异已全部找到责任人，
 * 实际升级必须另行提供提交和原版对照测试。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = file => JSON.parse(readFileSync(file, 'utf8'))
const unique = values => [...new Set(values)]
const hasText = value => typeof value === 'string' && value.trim().length > 0

export function buildHandoff(reference, catalog, coverage, sourceRoot = root) {
  assert.equal(reference.reference_sha256, catalog.reference_sha256,
    '原版 ELF 哈希必须与 M1 锁定版本相同')
  assert.equal(reference.scope, 'OFFLINE_UNAUTHENTICATED_CLI_CONTRACTS_ONLY')
  assert.ok(Array.isArray(reference.reference?.cases), '缺少原版真实命令测试记录')
  assert.ok(Array.isArray(reference.candidate?.cases), '缺少当前源码的实际命令结果')
  const original = new Map(reference.reference.cases.map(row => [row.id, row]))
  const rebuilt = new Map(reference.candidate.cases.map(row => [row.id, row]))
  assert.equal(original.size, reference.reference.cases.length, '原版测试ID必须唯一')
  assert.equal(rebuilt.size, reference.candidate.cases.length, '重建版测试ID必须唯一')
  assert.deepEqual([...original.keys()].sort(), [...rebuilt.keys()].sort(),
    '必须对相同命令运行同样的完整用例')
  assert.equal(original.size, catalog.comparison_cases,
    '用例数与M1已固定的原版运行基准不一致')
  assert.ok([...original.values()].every(row => row.pass === true),
    '原版基准异常时禁止生成确定的差分开发任务')

  const definitions = new Map(catalog.case_mapping.map(row => [row.id, row]))
  assert.equal(definitions.size, catalog.case_mapping.length, '开发任务中的差分ID重复')
  const features = new Map(coverage.features.map(row => [row.id, row]))
  const tasks = new Set(coverage.tasks.map(row => row.id))
  const scenarios = new Set(coverage.scenarios.map(row => row.id))
  const actualFailures = [...rebuilt.values()].filter(row => row.pass !== true)
  const differences = actualFailures.map(row => {
    const item = definitions.get(row.id)
    assert.ok(item, `已确认差异缺少开发责任：${row.id}`)
    assert.ok(tasks.has(item.owner) && /^M[2-9]$/.test(item.owner),
      `差异缺少有效开发卡：${row.id}`)
    assert.ok(item.feature_ids.length && item.scenario_ids.length && item.tests.includes(row.id),
      `差异没有功能、验收场景或真实测试：${row.id}`)
    for(const id of item.feature_ids) {
      const f = features.get(id)
      assert.ok(f, `未知功能 ${id}`)
      assert.ok(f.tasks.includes(item.owner), `${id} 未关联负责开发的 ${item.owner}`)
    }
    for(const id of item.scenario_ids) {
      assert.ok(scenarios.has(id), `未知运行场景 ${id}`)
      assert.ok(item.feature_ids.some(featureId => features.get(featureId).scenarios.includes(id)),
        `场景 ${id} 与该差异的功能无关`)
    }
    assert.ok(item.old_sources.length && hasText(item.target_behavior) &&
      hasText(item.change) && hasText(item.root_cause_status),
      `差异缺少旧源码或新版目标行为：${row.id}`)
    for(const anchor of item.old_sources) {
      const filename = join(sourceRoot, anchor.path)
      assert.ok(existsSync(filename), `源文件不存在：${anchor.path}`)
      assert.ok(readFileSync(filename, 'utf8').includes(anchor.symbol),
        `旧源码函数或消费者已变化，必须重新核查：${anchor.path}#${anchor.symbol}`)
    }
    return {
      id:item.id, priority:item.priority, feature_ids:item.feature_ids,
      owner:item.owner, dependencies:unique(item.downstream), scenario_ids:item.scenario_ids,
      old_sources:item.old_sources, target_behavior:item.target_behavior,
      root_cause_status:item.root_cause_status, required_source_change:item.change,
      initial_reference_pass:original.get(row.id).pass, candidate_pass:row.pass,
      actual_candidate_exit_code:row.exit_code,
      actual_contract:row.contract, tests:item.tests,
      state:'DIFFERENCE_CONFIRMED_SOURCE_CHANGE_REQUIRED',
      implementation_commits:[], integration_test_runs:[], accepted:false,
    }
  })
  assert.equal(differences.length, catalog.candidate_failures,
    '当前差异计数发生变化，必须更新任务归属，不可使用旧版差分假签收')
  assert.equal(differences.length, definitions.size,
    '所有开发卡必须与当前真实失败一一对应，已修复项须移入验证记录')

  const verifiedBaseline = [...rebuilt.values()]
    .filter(row => row.pass === true)
    .map(row => ({id:row.id, state:'CLI_BASELINE_ONLY_NOT_FULL_FEATURE_SIGNOFF'}))
  return {
    schema:1,plan:'2.1.310-v4',
    result_type:'M1_DIFFERENCE_DISCOVERY_AND_DEVELOPER_HANDOFF',
    source_run:catalog.baseline_source_run,
    reference_sha256:reference.reference_sha256,
    case_count:original.size, target_reference_passed:reference.reference.passed,
    candidate_baseline_passed:reference.candidate.passed,
    confirmed_differences:differences.length, differences, verifiedBaseline,
    development_owners:unique(differences.map(x => x.owner)),
    signoff_note:'M1完成对比和可执行交接；后续必须由实际源码提交、调用链与同环境原版行为测试单独验收。',
  }
}

function main(argv) {
  const inputAt = argv.indexOf('--input'), outputAt = argv.indexOf('--out')
  assert.ok(inputAt >= 0 && argv[inputAt+1] && outputAt >= 0 && argv[outputAt+1],
    '用法：node build/m1-v4-handoff.mjs --input DIFF_JSON --out TASK_JSON')
  const catalog=read(join(root,'docs/upgrade/m1-evidence/v4-首批实测差异与源码修改责任.json'))
  const coverage=read(join(root,'docs/upgrade/upgrade-coverage.json'))
  const result=buildHandoff(read(resolve(argv[inputAt+1])),catalog,coverage)
  const destination=resolve(argv[outputAt+1])
  mkdirSync(dirname(destination),{recursive:true})
  writeFileSync(destination,`${JSON.stringify(result,null,2)}\n`)
  console.log(JSON.stringify({plan:result.plan,reference:result.target_reference_passed,
    candidate:result.candidate_baseline_passed,differences:result.confirmed_differences,
    owners:result.development_owners,report:destination}))
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2))
