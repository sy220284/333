import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Message } from '../src/types/message.ts'
import {
  countRecentPermissionDenials, permissionDenialLoopGuidance,
} from '../src/services/tools/permissionDenialLoop.ts'

function toolResult(reason: string, denied = true): Message {
  return {
    type: 'user', sourceToolAssistantUUID: 'previous-call',
    message: { role: 'user', content: [{
      type: 'tool_result', tool_use_id: 'tool_1', content: reason, is_error: denied,
    }] },
  } as unknown as Message
}
const blocked = (command: string): Message => toolResult(
  'Permission for this action has been denied. Reason: blocked cleanup (' + command + ')',
)
const human = { type: 'user', message: { role: 'user', content: 'New user request' } } as Message

test('equivalent permission-denied attempts count as one consecutive loop', () => {
  const messages = [
    blocked('rm -rf /tmp/a'),
    { type: 'assistant', message: { role: 'assistant', content: [] } } as unknown as Message,
    blocked('python -c os.unlink'),
  ]
  assert.equal(countRecentPermissionDenials(messages), 2)
  const guidance = permissionDenialLoopGuidance(countRecentPermissionDenials(messages))
  assert.match(guidance ?? '', /REPEATED PERMISSION DENIAL \(3 consecutive attempts\)/)
  assert.match(guidance ?? '', /alternative tools or scripts/)
  assert.match(guidance ?? '', /continue independent permitted tasks/)
})

test('a successful tool or new human instruction resets the denial sequence', () => {
  assert.equal(countRecentPermissionDenials([blocked('rm'), toolResult('read ok', false)]), 0)
  assert.equal(countRecentPermissionDenials([blocked('rm'), human]), 0)
  assert.equal(countRecentPermissionDenials([blocked('rm'), toolResult('Error: other operation')]), 0)
  assert.equal(countRecentPermissionDenials([blocked('rm')]), 1)
  assert.equal(permissionDenialLoopGuidance(1), undefined)
})
