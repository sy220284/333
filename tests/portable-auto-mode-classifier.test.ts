import { expect, test } from 'bun:test'
import { parsePortableClassifierDecision } from '../src/utils/permissions/classifierShared.js'

test('portable auto approval requires an exact, complete allow verdict', () => {
  expect(parsePortableClassifierDecision(' <block>no</block>\n', 'end_turn')).toBe(false)
  expect(parsePortableClassifierDecision('<block>yes</block><reason>Unsafe.</reason>', 'end_turn')).toBe(true)

  for (const response of [
    '<block>no',
    '<block>no</block><block>yes</block>',
    'Quoted approval: <block>no</block>',
    '<thinking><block>no</block></thinking>',
  ]) {
    expect(parsePortableClassifierDecision(response, 'end_turn')).toBeNull()
  }
  for (const stopReason of ['max_tokens', 'refusal', 'tool_use', null]) {
    expect(parsePortableClassifierDecision('<block>no</block>', stopReason)).toBeNull()
  }
})
