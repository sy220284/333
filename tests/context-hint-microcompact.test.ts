import { describe, expect, test } from 'bun:test'
import type { Message } from '../src/types/message.js'
import {
  CLEARED_TOOL_RESULT,
  CONTEXT_HINT_KEEP_RECENT,
  CONTEXT_HINT_MIN_SAVING_TOKENS,
  getKeepRecentCandidates,
  keepRecentToolResults,
} from '../src/services/compact/keepRecentToolResults.js'

const options = {
  compactableTools: new Set(['Read', 'Bash']),
  estimateTextTokens: (text: string) => text.length,
}

function conversation(total = 7, chars = 12_000): Message[] {
  const messages: unknown[] = []
  for (let n = 0; n < total; n++) {
    messages.push({
      type: 'assistant',
      uuid: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: `call-${n}`, name: 'Read', input: {} }],
      },
    })
    messages.push({
      type: 'user',
      uuid: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: `call-${n}`, content: 'a'.repeat(chars) }],
      },
    })
  }
  return messages as Message[]
}

describe('2.1.310 context_hint keep-recent microcompact', () => {
  test('keeps the five newest qualified tool calls and clears 24,000 tokens', async () => {
    const messages = conversation()
    const written: string[] = []
    const result = await keepRecentToolResults(messages, {
      ...options,
      persist: async (_, id) => {
        written.push(id)
        return `<persisted-output>output-${id}`
      },
    })
    expect(result).not.toBeNull()
    expect(result!.tokensSaved).toBe(24_000)
    expect([...result!.clearedIds]).toEqual(['call-0', 'call-1'])
    expect(written).toEqual(['call-0', 'call-1'])
    expect((result!.messages[1] as any).message.content[0].content).toBe('<persisted-output>output-call-0')
    expect((result!.messages[13] as any).message.content[0].content).toBe('a'.repeat(12_000))
    expect((messages[1] as any).message.content[0].content).toBe('a'.repeat(12_000))
  })

  test('does not compact below the 20k threshold, or persist anything', async () => {
    const persisted: string[] = []
    const result = await keepRecentToolResults(conversation(7, 9_999), {
      ...options,
      persist: async (_, id) => {
        persisted.push(id)
        return null
      },
    })
    expect(result).toBeNull()
    expect(persisted).toEqual([])
  })

  test('retries do not repeatedly clear already-cleared tool content', async () => {
    const initial = await keepRecentToolResults(conversation(), options)
    expect(initial).not.toBeNull()
    expect((initial!.messages[1] as any).message.content[0].content).toBe(CLEARED_TOOL_RESULT)
    const result = await keepRecentToolResults(initial!.messages, options)
    expect(result).toBeNull()
  })

  test('failed persistence rejects before mutating any conversation message', async () => {
    const messages = conversation()
    await expect(
      keepRecentToolResults(messages, {
        ...options,
        persist: async () => { throw new Error('disk write failed') },
      }),
    ).rejects.toThrow('disk write failed')
    expect((messages[1] as any).message.content[0].content).toBe('a'.repeat(12_000))
  })

  test('noncompactable tool results never become candidates', () => {
    const messages = conversation() as any[]
    messages[0].message.content[0].name = 'Task'
    expect(getKeepRecentCandidates(messages as Message[], options).tokensSaved).toBe(12_000)
  })

  test('explicit retention of one still protects the newest call', async () => {
    const result = await keepRecentToolResults(conversation(4), {
      ...options,
      keepRecent: 1,
    })
    expect([...result!.clearedIds]).toEqual(['call-0', 'call-1', 'call-2'])
    expect((result!.messages[7] as any).message.content[0].content).toBe('a'.repeat(12_000))
  })

  test('target thresholds are pinned to the actual 2.1.310 context-hint path', () => {
    expect(CONTEXT_HINT_KEEP_RECENT).toBe(5)
    expect(CONTEXT_HINT_MIN_SAVING_TOKENS).toBe(20_000)
  })
})
