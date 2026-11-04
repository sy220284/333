import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDiscardedQueueRecords, createQueueOperationRecord, partitionQueueForClear } from '../src/utils/queueOperation317.mjs'

test('2.1.317 queue: enqueue and popAll carry text, dequeue only event, remove carries identity', () => {
  const sessionId = 'session-317'
  const command = { uuid: 'command-317', deliveryId: 'receipt-317', mode: 'prompt', value: 'read the file' }
  const at = new Date('2026-11-04T00:00:00.000Z')
  const records = ['enqueue', 'dequeue', 'remove', 'popAll']
    .map(operation => createQueueOperationRecord(operation, command, sessionId, at))
  assert.deepEqual(records.map(r => r.commandUuid), [undefined, undefined, 'command-317', undefined])
  assert.deepEqual(records.map(r => r.deliveryId), [undefined, undefined, 'receipt-317', undefined])
  assert.deepEqual(records.map(r => r.content), ['read the file', undefined, 'read the file', 'read the file'])
  assert.ok(records.every(r => r.timestamp === at.toISOString() && r.sessionId === sessionId))
  assert.ok(records.every(r => r.type === 'queue-operation'))
})

test('2.1.317 queue: image/multipart commands are logged without serializing private payloads', () => {
  const record = createQueueOperationRecord(
    'enqueue',
    { uuid: 'images-1', value: [{ type: 'image', source: { type: 'base64', data: 'SECRETS' } }] },
    'session-317',
  )
  assert.equal('commandUuid' in record, false)
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

test('317 条件清理: 保留远端通知，仅记录丢弃的本地消息', () => {
  const queue = [
    { uuid: 'user-1', value: 'cancel me', mode: 'prompt' },
    { uuid: 'peer-1', value: 'retain peer', origin: { kind: 'peer' } },
    { uuid: 'task-1', value: 'retain notification', mode: 'task-notification' },
  ]
  const { retained, discarded } = partitionQueueForClear(
    queue, command => command.origin?.kind === 'peer' || command.mode === 'task-notification',
  )
  assert.deepEqual(retained.map(command => command.uuid), ['peer-1', 'task-1'])
  assert.deepEqual(discarded.map(command => command.uuid), ['user-1'])
  assert.deepEqual(
    createDiscardedQueueRecords(discarded, 'session-317').map(record => record.commandUuid),
    ['user-1'],
  )
  assert.deepEqual(queue.map(command => command.uuid), ['user-1', 'peer-1', 'task-1'])
})

test('317 条件清理: 保留条件报错时原队列内容保持不变', () => {
  const queue = [{ uuid: 'first' }, { uuid: 'second' }]
  assert.throws(
    () => partitionQueueForClear(queue, command => {
      if (command.uuid === 'second') throw Error('predicate failure')
      return true
    }),
    /predicate failure/,
  )
  assert.deepEqual(queue.map(command => command.uuid), ['first', 'second'])
})

test('317 队列预审: 原始文本在安全检查完成前不写入日志', () => {
  for (const gate of ['screeningPending', 'screeningOwed']) {
    const record = createQueueOperationRecord('enqueue', {
      value: 'sensitive unapproved text', uuid: 'queued-317', [gate]: true,
    }, 'session-317')
    assert.equal('content' in record, false, gate)
  }
  const submitted = createQueueOperationRecord('enqueue', {
    value: 'unapproved original', screeningPending: true,
    promptSubmitted: { text: 'approved replacement' },
  }, 'session-317')
  assert.equal(submitted.content, 'approved replacement')
})

test('317 轮次吸收: 消费消息与用户取消的落盘原因不同', () => {
  const message = { uuid: 'queued-317', value: 'use this in current model turn' }
  const at = new Date('2026-11-04T00:00:00.000Z')
  const consumed = createQueueOperationRecord(
    'remove', message, 'session-317', at, { reason: 'absorbed_mid_turn' },
  )
  const cancelled = createQueueOperationRecord(
    'remove', message, 'session-317', at, { reason: 'cleared_on_cancel' },
  )
  assert.equal(consumed.reason, 'absorbed_mid_turn')
  assert.equal(cancelled.reason, 'cleared_on_cancel')
  assert.equal(consumed.commandUuid, cancelled.commandUuid)
  assert.notDeepEqual(consumed, cancelled)
})

test('317官方安全记录: plugin queue-record负责的原始文本不重复写盘', () => {
  const original = createQueueOperationRecord('enqueue', {
    uuid: 'private-317', mode: 'prompt', value: 'sensitive text',
    pluginQueueRecordHookActive: true,
  }, 'session-317')
  assert.equal('content' in original, false)
  const approved = createQueueOperationRecord('enqueue', {
    uuid: 'private-317', mode: 'prompt', value: 'original',
    promptSubmitted: { text: 'approved text' }, pluginQueueRecordHookActive: true,
  }, 'session-317')
  assert.equal(approved.content, 'approved text')
})

test('317官方队列出队记录没有文本、拒绝原因和消息标识', () => {
  const record = createQueueOperationRecord('dequeue', {
    uuid: 'uuid-317', value: 'secret', deliveryId: 'receipt',
  }, 'session-317', new Date('2026-11-04T00:00:00.000Z'), { reason: 'ignored' })
  assert.deepEqual(Object.keys(record), ['type', 'operation', 'timestamp', 'sessionId'])
})
