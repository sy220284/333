import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourcePath = 'docs/upgrade/m1-evidence/2.1.311-2.1.317-官方逐条变更与验收台账.json'
const matrixPath = 'docs/upgrade/m1-evidence/2.1.317-366项功能链路分组矩阵.json'
const sourceText = readFileSync(resolve(root, sourcePath), 'utf8')
const ledger = JSON.parse(sourceText)
const matrix = JSON.parse(readFileSync(resolve(root, matrixPath), 'utf8'))

const gitBlobSha = text =>
  createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')

test('2.1.317 功能链路覆盖全部366条无代码关联的官方记录，不漏项不重号', () => {
  assert.equal(ledger.entries.length, 392)
  assert.equal(matrix.target_version, '2.1.317')
  assert.equal(matrix.total, 366)
  assert.equal(matrix.items.length, 366)
  assert.equal(matrix.source_ledger, sourcePath)
  assert.equal(matrix.source_ledger_blob_sha, gitBlobSha(sourceText), '官方更新台账已改变，须同步重新核查链路分类')
  const pending = ledger.entries.filter(item => !item.changed_files?.length)
  assert.equal(pending.length, 366)
  assert.equal(new Set(matrix.items.map(item => item.id)).size, 366)
  assert.deepEqual(matrix.items.map(item => item.id).sort(), pending.map(item => item.id).sort())
  const references = new Map(pending.map(item => [item.id, item]))
  for (const item of matrix.items) {
    const original = references.get(item.id)
    assert.equal(item.official_text, original.official_text, item.id)
    assert.equal(item.version, original.version, item.id)
    assert.equal(item.verification, 'PENDING_SOURCE_BINARY_E2E', item.id)
    assert.match(item.implementation_evidence, /待核当前实现/, item.id)
    assert.ok(['P0', 'P1', 'P2'].includes(item.priority), item.id)
    assert.ok(item.platforms.length, item.id)
  }
})
test('20条链路的源码候选路径存在，跨链依赖和责任有效', () => {
  assert.equal(matrix.routes.length, 20)
  const routes = new Map(matrix.routes.map(chain => [chain.id, chain]))
  assert.equal(routes.size, 20)
  for (const route of matrix.routes) {
    assert.ok(route.flow.length >= 3, route.id)
    assert.ok(route.source_candidates.length >= 2, route.id)
    for (const candidate of route.source_candidates) {
      assert.equal(candidate.exists_in_repo, true, candidate.path)
      assert.ok(candidate.path.startsWith('src/') || candidate.path.startsWith('build/'), candidate.path)
      assert.ok(statSync(resolve(root, candidate.path)).isFile(), candidate.path)
    }
  }
  for (const item of matrix.items) {
    assert.ok(routes.has(item.chain), item.id)
    assert.equal(item.owner, routes.get(item.chain).owner, item.id)
    assert.equal(new Set(item.secondary_chains).size, item.secondary_chains.length, item.id)
    for (const id of item.secondary_chains) {
      assert.ok(routes.has(id) && id !== item.chain, item.id + ': ' + id)
    }
  }
})
test('更新数量、阶段依赖和逐条人工归属保持一致', () => {
  const stages = new Map(matrix.stages.map(stage => [stage.id, stage]))
  assert.equal(stages.size, 6)
  for (const stage of matrix.stages) {
    for (const prior of stage.requires) {
      assert.ok(stages.has(prior) && prior < stage.id, stage.title)
    }
  }
  let total = 0
  for (const route of matrix.routes) {
    const entries = matrix.items.filter(item => item.chain === route.id)
    const counted = matrix.counts[route.id]
    assert.equal(counted.total, entries.length, route.id)
    assert.equal(counted.P0 + counted.P1 + counted.P2, entries.length, route.id)
    for (const priority of ['P0', 'P1', 'P2']) {
      assert.equal(counted[priority], entries.filter(item => item.priority === priority).length, route.id)
    }
    assert.ok(stages.has(route.stage), route.id)
    total += entries.length
  }
  assert.equal(total, 366)
  assert.deepEqual(matrix.manual_review.needs_route_review, [], '仍有更新未完成路由归类')
})
