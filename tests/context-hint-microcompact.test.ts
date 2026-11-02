import { describe, expect, test } from 'bun:test'
import type { Message } from '../src/types/message.js'
import {
  CLEARED_TOOL_RESULT,
  EXTERNAL_ARTIFACT_PROVENANCE,
  CONTEXT_HINT_KEEP_RECENT,
  CONTEXT_HINT_MIN_SAVING_TOKENS,
  getKeepRecentCandidates,
  keepRecentToolResults,
} from '../src/services/compact/keepRecentToolResults.js'

function resultBlock(messages: Message[], index: number) {
  const message = messages[index]
  if (message?.type !== 'user' || !Array.isArray(message.message.content)) {
    throw new Error(`Expected user tool-result message at index ${index}`)
  }
  const block = message.message.content[0]
  if (block?.type !== 'tool_result') {
    throw new Error(`Expected tool_result content block at index ${index}`)
  }
  return block
}

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Expected a compacted result')
  return value
}

function renameTool(messages: Message[], index: number, name: string): void {
  const message = messages[index]
  if (message?.type !== 'assistant' || message.message.content[0]?.type !== 'tool_use') {
    throw new Error(`Expected assistant tool_use message at index ${index}`)
  }
  message.message.content[0].name = name
}

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
    expect(required(result).tokensSaved).toBe(24_000)
    expect([...required(result).clearedIds]).toEqual(['call-0', 'call-1'])
    expect(written).toEqual(['call-0', 'call-1'])
    expect(resultBlock(required(result).messages, 1).content).toBe('<persisted-output>output-call-0')
    expect(resultBlock(required(result).messages, 13).content).toBe('a'.repeat(12_000))
    expect(resultBlock(messages, 1).content).toBe('a'.repeat(12_000))
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
    expect(resultBlock(required(initial).messages, 1).content).toBe(CLEARED_TOOL_RESULT)
    const result = await keepRecentToolResults(required(initial).messages, options)
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
    expect(resultBlock(messages, 1).content).toBe('a'.repeat(12_000))
  })

  test('noncompactable tool results never become candidates', () => {
    const messages = conversation()
    renameTool(messages, 0, 'Task')
    expect(getKeepRecentCandidates(messages, options).tokensSaved).toBe(12_000)
  })

  test('explicit retention of one still protects the newest call', async () => {
    const result = await keepRecentToolResults(conversation(4), {
      ...options,
      keepRecent: 1,
    })
    expect([...required(result).clearedIds]).toEqual(['call-0', 'call-1', 'call-2'])
    expect(resultBlock(required(result).messages, 7).content).toBe('a'.repeat(12_000))
  })

  test('externally authored artifact provenance survives persisted output replacement and retries', async () => {
    const messages = conversation()
    const originalText = `<artifact-content-authored-by-others/>\\n${'untrusted'.repeat(2_000)}`
    ;resultBlock(messages, 1).content = originalText
    const result = await keepRecentToolResults(messages, {
      ...options,
      persist: async (_content, id) => `<persisted-output>output-${id}`,
    })
    expect(result).not.toBeNull()
    expect(resultBlock(required(result).messages, 1).content).toBe(
      `${EXTERNAL_ARTIFACT_PROVENANCE}<persisted-output>output-call-0`,
    )
    expect(resultBlock(messages, 1).content).toBe(originalText)
    expect(getKeepRecentCandidates(required(result).messages, options).tokensSaved).toBe(0)
    expect(await keepRecentToolResults(required(result).messages, options)).toBeNull()
  })

  test('nonmedia search results are stored as references instead of discarded', async () => {
    const messages = conversation()
    // Deliberately inject an external result shape outside the SDK's declared union.
    Reflect.set(resultBlock(messages, 1), 'content', [
      {type: 'search_result', content: 'third-party results', title: 'Search'},
    ])
    const result = await keepRecentToolResults(messages, {
      ...options,
      minTokensSaved: 1_000,
      persist: async () => '<persisted-output>search-archive',
    })
    expect(result).not.toBeNull()
    expect(resultBlock(required(result).messages, 1).content).toBe(
      '<persisted-output>search-archive',
    )
  })

  test('target thresholds are pinned to the actual 2.1.310 context-hint path', () => {
    expect(CONTEXT_HINT_KEEP_RECENT).toBe(5)
    expect(CONTEXT_HINT_MIN_SAVING_TOKENS).toBe(20_000)
  })
})
