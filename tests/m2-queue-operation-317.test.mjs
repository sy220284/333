import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDiscardedQueueRecords, createQueueOperationRecord } from '../src/utils/queueOperation317.mjs'

test('2.1.317 queue: journal links enqueue, dequeue and removal by UUID', () => {
  const sessionId = 'session-317'
  const command = { uuid: 'command-317', mode: 'prompt', value: 'read the file' }
  const at = new Date('2026-11-04T00:00:00.000Z')
  const records = ['enqueue', 'dequeue', 'remove', 'popAll']
    .map(operation => createQueueOperationRecord(operation, command, sessionId, at))
  assert.deepEqual(records.map(r => r.commandUuid), Array(4).fill('command-317'))
  assert.deepEqual(records.map(r => r.content), Array(4).fill('read the file'))
  assert.deepEqual(records.map(r => r.timestamp), Array(4).fill(at.toISOString()))
  assert.ok(records.every(r => r.type === 'queue-operation' && r.sessionId === sessionId))
})

test('2.1.317 queue: image/multipart commands are logged without serializing private payloads', () => {
  const record = createQueueOperationRecord(
    'enqueue',
    { uuid: 'images-1', value: [{ type: 'image', source: { type: 'base64', data: 'SECRETS' } }] },
    'session-317',
  )
  assert.equal(record.commandUuid, 'images-1')
  assert.equal('content' in record, false)
  assert.equal(JSON.stringify(record).includes('SECRETS'), false)
})

test('2.1.317 queue: record without command identity remains valid', () => {
  const record = createQueueOperationRecord('dequeue', undefined, 'session-317')
  assert.equal(record.type, 'queue-operation')
  assert.equal(record.operation, 'dequeue')
  assert.equal('commandUuid' in record, false)
  assert.equal('content' in record, false)
})

test('317取消与撤销: 源UUID、投递ID和移除原因进入恢复日志', () => {
  const at = new Date('2026-11-04T00:00:00.000Z')
  const command = {
    uuid: 'message-317',
    attachmentSourceUuid: 'origin-317',
    deliveryId: 'delivery-317',
    mode: 'prompt',
    value: 'draft',
    promptSubmitted: { text: 'confirmed text' },
  }
  const record = createQueueOperationRecord('remove', command, 'session-317', at, { reason: 'cleared_on_cancel' })
  assert.equal(record.commandUuid, 'origin-317')
  assert.equal(record.deliveryId, 'delivery-317')
  assert.equal(record.reason, 'cleared_on_cancel')
  assert.equal(record.content, 'confirmed text')
})

test('317 Hook 丢弃: 保留原因和投递关联，不持久化被拦截的输入', () => {
  const record = createQueueOperationRecord('remove', {
    uuid: 'hook-317', deliveryId: 'delivery-317', value: 'do not persist this',
  }, 'session-317', new Date(), { reason: 'dropped_by_hook' })
  assert.equal(record.reason, 'dropped_by_hook')
  assert.equal(record.commandUuid, 'hook-317')
  assert.equal(record.deliveryId, 'delivery-317')
  assert.equal('content' in record, false)
})

test('317 清空队列: 逐条记录取消，跳过未记录和仍在检查的命令', () => {
  const records = createDiscardedQueueRecords([
    { uuid: 'user-317', value: 'text prompt' },
    { uuid: 'image-317', value: [{ type: 'image', source: { type: 'base64', data: 'PRIVATE-IMAGE' } }] },
    { uuid: 'hidden-317', value: 'hidden', unlogged: true },
    { uuid: 'screening-317', value: 'in progress', screeningPending: true },
  ], 'session-317')
  assert.deepEqual(records.map(record => record.commandUuid), ['user-317', 'image-317'])
  assert.ok(records.every(record => record.reason === 'cleared_on_cancel'))
  assert.equal(JSON.stringify(records).includes('PRIVATE-IMAGE'), false)
})
