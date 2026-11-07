import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const load = filename => JSON.parse(readFileSync(new URL(`../docs/upgrade/m1-evidence/${filename}`, import.meta.url), 'utf8'))
const ledger = load('2.1.311-2.1.317-官方逐条变更与验收台账.json')
const previous = load('2.1.317-366项功能链路分组矩阵.json')
const complete = load('2.1.317-392项完整功能链路分组矩阵.json')
const product = load('2.1.317-392项产品保留适配与退役判定.json')

test('2.1.317 官方392条更新与完整追踪矩阵一一对应', () => {
  assert.equal(ledger.entries.length, 392)
  assert.equal(complete.items.length, 392)
  assert.equal(complete.total, 392)
  const sourceIds = ledger.entries.map(entry => entry.id)
  const matrixIds = complete.items.map(item => item.id)
  assert.equal(new Set(sourceIds).size, 392)
  assert.deepEqual(matrixIds, sourceIds, '逐条更新必须保持官方顺序，不得遗漏或重复')
  for (let i = 0; i < ledger.entries.length; i++) {
    assert.equal(complete.items[i].official_text, ledger.entries[i].official_text,
      `更新 ${matrixIds[i]} 的官方原文存在偏差`)
  }
})

test('完整矩阵原有366项状态与归属全部保留', () => {
  assert.equal(previous.items.length, 366)
  const previousById = new Map(previous.items.map(item => [item.id, item]))
  const completeById = new Map(complete.items.map(item => [item.id, item]))
  for (const [id, before] of previousById) {
    assert.deepEqual(completeById.get(id), before, `${id} 原有实现证据、签收状态或职责链被改写`)
  }
  assert.equal(complete.lineage.legacy_items, 366)
  assert.equal(complete.lineage.added_items, 26)
})

test('补齐26项有追踪职责且必须经过源码及运行验证', () => {
  const previousIds = new Set(previous.items.map(item => item.id))
  const additional = complete.items.filter(item => !previousIds.has(item.id))
  assert.equal(additional.length, 26)
  assert.deepEqual(additional.map(item => item.id), complete.lineage.addition_ids)
  const chains = new Set(complete.routes.map(route => route.id))
  for (const item of additional) {
    assert.ok(chains.has(item.chain), `${item.id} 缺少功能链负责人`)
    assert.equal(item.owner, item.chain)
    assert.equal(item.verification, 'PENDING_SOURCE_BINARY_E2E')
    assert.ok(item.implementation_evidence, `${item.id} 缺少审计注记`)
    assert.ok(item.official_text, `${item.id} 缺少官方原文`)
  }
})

test('392项职责链计数与实际状态严格相符', () => {
  const totals = Object.fromEntries(complete.routes.map(route => [route.id, { total: 0, P0: 0, P1: 0, P2: 0 }]))
  const verified = {}
  for (const item of complete.items) {
    assert.ok(totals[item.chain], `${item.id} 归属不存在`)
    assert.ok(['P0','P1','P2'].includes(item.priority), `${item.id} 优先级无效`)
    totals[item.chain].total++
    totals[item.chain][item.priority]++
    verified[item.verification] = (verified[item.verification] ?? 0) + 1
  }
  assert.deepEqual(complete.counts, totals)
  assert.equal(complete.verification_summary.pending_source_binary_e2e, verified.PENDING_SOURCE_BINARY_E2E)
  assert.equal(complete.verification_summary.scenario_e2e_pass_pending_chain, verified.SCENARIO_E2E_PASS_PENDING_FULL_CHAIN)
  assert.equal(complete.verification_summary.source_unit_pass_pending_e2e, verified.SOURCE_UNIT_TEST_PASS_PENDING_E2E)
  assert.equal(complete.verification_summary.formally_closed, 0)
})

test('官方392项产品范围判定完整且保持原版证据', () => {
  const ids = complete.items.map(item => item.id)
  const categories = new Set(['RETAIN_OFFICIAL_PARITY','ADAPT_TO_LOCAL_EQUIVALENT','EXCLUDE_RETIRED_FEATURE'])
  assert.equal(product.official_source_matrix,'docs/upgrade/m1-evidence/2.1.317-392项完整功能链路分组矩阵.json')
  assert.deepEqual(product.decisions.map(row => row.id), ids)
  assert.deepEqual([...new Set(product.decisions.map(row => row.id))].length, 392)
  const tally = {}
  const rules = {}
  for (let i = 0; i < product.decisions.length; i++) {
    const row = product.decisions[i]
    assert.ok(categories.has(row.disposition), `${row.id} 产品范围归类无效`)
    assert.equal(row.official_update,complete.items[i].official_text, `${row.id} 的官方原文被替换`)
    assert.ok(row.decision_reason, `${row.id} 未给出保留、适配或剔除理由`)
    assert.ok(row.acceptance, `${row.id} 缺少验收标准`)
    assert.ok(row.local_contract, `${row.id} 缺少产品端目标或退役边界`)
    assert.ok(row.candidate_entrypoints.length > 0, `${row.id} 缺少本地关联检查入口`)
    for (const path of row.candidate_entrypoints) {
      assert.ok(existsSync(new URL(`../${path}`,import.meta.url)), `${row.id} 关联文件不存在：${path}`)
    }
    tally[row.disposition] = (tally[row.disposition] || 0) + 1
    rules[row.policy_rule] = (rules[row.policy_rule] || 0) + 1
    if (row.disposition === 'EXCLUDE_RETIRED_FEATURE') {
      assert.equal(row.implementation_gate, 'RETIRED_NO_IMPLEMENTATION')
      assert.equal(row.validation_status, 'PENDING_RETIREMENT_GUARD')
    } else {
      assert.equal(row.validation_status, 'PENDING_IMPLEMENTATION_AND_RUNTIME_VERIFICATION')
    }
  }
  assert.deepEqual(product.scope_counts,tally)
  assert.deepEqual(product.scope_rules,rules)
  assert.equal(product.active_acceptance_count,tally.RETAIN_OFFICIAL_PARITY+tally.ADAPT_TO_LOCAL_EQUIVALENT)
  assert.equal(product.excluded_count,tally.EXCLUDE_RETIRED_FEATURE)
  assert.equal(product.local_adaptation_count,tally.ADAPT_TO_LOCAL_EQUIVALENT)
  assert.equal(product.retained_parity_count,tally.RETAIN_OFFICIAL_PARITY)
  assert.equal(product.active_acceptance_count+product.excluded_count,392)
})

test('官方已退役服务不会因原版行为校验被重新接入', () => {
  const table = new Map(product.decisions.map(row => [row.id,row]))
  const excluded = [
    '2.1.311#088', // Claude Tag 云端 Slack 管理与技能统计
    '2.1.317#006', // OTLP 上传账户元数据
    '2.1.317#007', // Claude apps gateway 官方财务 API
    '2.1.317#071', // 官方企业 Gateway 组池用量
    '2.1.317#008', // 官方 IdP 组成员统计存储
    '2.1.317#044', // 向 OTLP 代理上报
    '2.1.317#046', // OTLP 远程上传超时
    '2.1.317#049', // 官方 Remote Control 命令
    '2.1.317#058', // 官方 design-sync 云端迁移上传
    '2.1.317#087', // Claude Tag / Slack 卡片
  ]
  for (const id of excluded) assert.equal(table.get(id)?.disposition,'EXCLUDE_RETIRED_FEATURE', `${id} 官方云端专属能力需要退出产品验收`)
  const local = [
    '2.1.311#021', // WebFetch 本地超时
    '2.1.312#031', // 本地会话重复发送
    '2.1.316#046', // 本地 SDK MCP 表单
    '2.1.317#009', // 本地嵌套会话隔离
    '2.1.317#015', // 本地多工具审批信息
    '2.1.317#019', // 本地 Artifact 权限
    '2.1.317#053', // 本地反馈进度
    '2.1.317#082', // 本地 MCP 链接请求
  ]
  for (const id of local) assert.equal(table.get(id)?.disposition,'ADAPT_TO_LOCAL_EQUIVALENT', `${id} 的本地等效能力不可因官方云端退役被丢弃`)
  for (const id of ['2.1.317#002','2.1.317#003','2.1.317#040','2.1.317#068']) {
    assert.notEqual(table.get(id)?.disposition,'EXCLUDE_RETIRED_FEATURE', `${id} 为保留产品的权限或文件安全能力`)
  }
})
