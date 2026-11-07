import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { thinkingDurationLabel } from '../src/components/messages/thinkingDurationLabel.ts'

test('完成的思考持续时间独立显示中文且按照实际秒数计算', () => {
  assert.equal(thinkingDurationLabel(2500), '思考了 2 秒')
  assert.equal(thinkingDurationLabel(12000), '思考了 12 秒')
  assert.equal(thinkingDurationLabel(0), '思考了 1 秒')
  for (const invalid of [NaN, Infinity, -1])
    assert.throws(() => thinkingDurationLabel(invalid), RangeError)
})

test('新桌面从 SDK 实际流构建消息并使用时间字段',()=>{
  const app=readFileSync(new URL('../desktop/src/App.tsx',import.meta.url),'utf8')
  const chat=readFileSync(new URL('../desktop/src/components/chat/SessionChatSurface.tsx',import.meta.url),'utf8')
  assert.match(app,/streaming\.type==='content_block_delta'/)
  assert.match(app,/streaming\.delta/)
  assert.match(chat,/new Date\(m\.time\)/)
})

test('普通对话在正文前渲染思考用时，思考全文仍保持折叠', () => {
  const component = readFileSync(new URL('../src/components/Message.tsx', import.meta.url), 'utf8')
  assert.match(component, /thinkingDurationLabel\(message\.thinkingDurationMs\)/)
  assert.match(component, /!verbose && !isTranscriptMode/)
  assert.match(component, /message\.message\.content\.some\(block => block\.type === 'thinking'\)/)
  assert.match(component, /\{t3\}/)
})

test('消息归一化保留思考完成元数据，避免UI前丢失', () => {
  const code = readFileSync(new URL('../src/utils/messages.ts', import.meta.url), 'utf8')
  assert.match(code, /thinkingDurationMs: message\.thinkingDurationMs/)
  assert.match(code, /thinkingDisplay: message\.thinkingDisplay/)
})
