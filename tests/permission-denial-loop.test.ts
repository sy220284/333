import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Message } from '../src/types/message.ts'
import {
  countRecentPermissionDenials, permissionDenialKey, permissionDenialLoopGuidance,
} from '../src/services/tools/permissionDenialLoop.ts'

const key = permissionDenialKey('Bash', '/project', { command: 'rm temp.txt' })
const other = permissionDenialKey('Bash', '/project', { command: 'rm other.txt' })

function result(content: string, fingerprint?: string): Message {
  return {
    type: 'user', sourceToolAssistantUUID: 'previous-call',
    permissionDenialKey: fingerprint,
    message: { role: 'user', content: [{
      type: 'tool_result', tool_use_id: 'tool_1', content, is_error: !!fingerprint,
    }] },
  } as unknown as Message
}

test('actual denial messages count by decision metadata, not wording', () => {
  const messages = [
    result('This command requires approval', key),
    result('rm was blocked. For security, check the workspace.', key),
  ]
  assert.match(permissionDenialLoopGuidance(countRecentPermissionDenials(messages, key)) ?? '',
    /REPEATED PERMISSION DENIAL \(3 consecutive attempts\)/)
})

test('unrelated decisions, success and a new instruction reset the sequence', () => {
  const first = result('blocked', key)
  assert.equal(countRecentPermissionDenials([first, result('blocked', other)], key), 0)
  assert.equal(countRecentPermissionDenials([first, result('success')], key), 0)
  const human = { type: 'user', message: { role: 'user', content: 'New instruction' } } as Message
  assert.equal(countRecentPermissionDenials([first, human], key), 0)
  assert.equal(permissionDenialLoopGuidance(countRecentPermissionDenials([first], key)), undefined)
})

test('fingerprint is stable for object order and scoped to tool, directory and inputs', () => {
  assert.equal(permissionDenialKey('Read', '/a', { path: 'file', options: { b: 2, a: 1 } }),
    permissionDenialKey('Read', '/a', { options: { a: 1, b: 2 }, path: 'file' }))
  assert.notEqual(key, other)
  assert.notEqual(key, permissionDenialKey('Bash', '/other', { command: 'rm temp.txt' }))
})
