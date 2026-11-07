import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const load = filename => JSON.parse(readFileSync(new URL(`../docs/upgrade/m1-evidence/${filename}`, import.meta.url), 'utf8'))
const ledger = load('2.1.311-2.1.317-官方逐条变更与验收台账.json')
const previous = load('2.1.317-366项功能链路分组矩阵.json')
const complete = load('2.1.317-392项完整功能链路分组矩阵.json')

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
