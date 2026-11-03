import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('交互式 /context 与 SDK 查询统一走当前上下文边界及微压缩视图', () => {
  const interactive = source('../src/commands/context/context.tsx')
  const headless = source('../src/commands/context/context-noninteractive.ts')
  for (const text of [interactive, headless]) {
    assert.match(text, /getMessagesAfterCompactBoundary\(messages\)/)
    assert.match(text, /microcompactMessages\(apiView\)/)
    assert.match(text, /analyzeContextUsage\(/)
    assert.doesNotMatch(text, /CONTEXT_COLLAPSE|contextCollapse|projectView/)
  }
})

test('SDK 上下文数据仍采用实际 API 对话视图进行用量提取', () => {
  const headless = source('../src/commands/context/context-noninteractive.ts')
  assert.match(headless, /compactedMessages[\s\S]*?analyzeContextUsage\(/)
  assert.match(headless, /apiView, \/\/ original messages for API usage extraction/)
})
