import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createQueueOperationRecord } from '../src/utils/queueOperation317.mjs'

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
