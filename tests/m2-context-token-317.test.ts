import { expect, test } from 'bun:test'
import { roughTokenCountEstimationForMessage } from '../src/services/tokenEstimation.js'
import { getKeepRecentCandidates } from '../src/services/compact/keepRecentToolResults.js'
import type { Message } from '../src/types/message.js'

const document = (title: string, data: string) => ({ type: 'document', title, source: { type: 'text', media_type: 'text/plain', data } })

test('317 context estimates text documents by content and JSON density', () => {
  expect(roughTokenCountEstimationForMessage({ type: 'user', message: { content: [document('notes.txt', 'a'.repeat(800))] } })).toBe(200)
  expect(roughTokenCountEstimationForMessage({ type: 'user', message: { content: [document('DATA.JSON', 'a'.repeat(800))] } })).toBe(400)
})

test('317 nested document content counts text and images without base64 inflation', () => {
  const content = [{ type: 'document', source: { type: 'content', content: [{ type: 'text', text: 'a'.repeat(400) }, { type: 'image', source: { type: 'base64', data: 'A'.repeat(100000) } }] } }]
  expect(roughTokenCountEstimationForMessage({ type: 'user', message: { content } })).toBe(2100)
})

test('317 microcompact savings count documents and search results using the same content rules', () => {
  const content = [document('notes.json', 'a'.repeat(800)), { type: 'search_result', source: 'fixture', title: 'result', content: [{ type: 'text', text: 'b'.repeat(400) }] }]
  const messages = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'old', name: 'Read', input: {} }, { type: 'tool_use', id: 'recent', name: 'Read', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'old', content }] } },
  ] as unknown as Message[]
  expect(getKeepRecentCandidates(messages, { keepRecent: 1, compactableTools: new Set(['Read']) }).tokensSaved).toBe(500)
})
