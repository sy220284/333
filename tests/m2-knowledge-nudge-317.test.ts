import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KNOWLEDGE_PROMPT_317,
  parseKnowledgeNote317,
} from '../src/services/youShouldKnow/knowledgeNudge317.js'

test('knowledge scout has the model contract and a no-suggestion branch', () => {
  assert.match(KNOWLEDGE_PROMPT_317, /learn: none/)
  assert.match(KNOWLEDGE_PROMPT_317, /timely and verifiable/)
  assert.equal(parseKnowledgeNote317('learn: none', 0), null)
})

test('knowledge insight must contain an actionable sentence and supporting explanation', () => {
  const note = parseKnowledgeNote317(
    'learn: The parser already filters invalid dates before dispatch.\n' +
    'tag: Heads up\nexplain:\n' +
    '- The date parser validates ISO 8601 strings.\n' +
    '- Reusing that check avoids duplicate work.',
    1234,
  )
  assert.equal(note?.tag, 'Heads up')
  assert.equal(note?.at, 1234)
  assert.match(note?.explain ?? '', /date parser/)
})

test('knowledge parser rejects unsupported format or unsupported evidence', () => {
  assert.throws(() => parseKnowledgeNote317('nonsense', 0), /expected format/)
  assert.throws(
    () => parseKnowledgeNote317(
      'learn: No.\ntag: Tip\nexplain:\nToo short', 0),
    /length and evidence/,
  )
})
