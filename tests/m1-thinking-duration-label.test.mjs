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

test('真实流式思考起止时间写入助手消息元数据，不改变模型正文', () => {
  const code = readFileSync(new URL('../src/screens/REPL.tsx', import.meta.url), 'utf8')
  assert.match(code, /thinkingPhaseStartedAtRef\.current \?\?= Date\.now\(\)/)
  assert.match(code, /pendingThinkingDurationMsRef\.current = Date\.now\(\) - thinkingPhaseStartedAtRef\.current/)
  assert.match(code, /newMessage\.thinkingDurationMs \?\?= pendingThinkingDurationMsRef\.current/)
})

test('普通对话在正文前渲染思考用时，思考全文仍保持折叠', () => {
  const component = readFileSync(new URL('../src/components/Message.tsx', import.meta.url), 'utf8')
  assert.match(component, /thinkingDurationLabel\(message\.thinkingDurationMs\)/)
  assert.match(component, /!verbose && !isTranscriptMode/)
  assert.match(component, /message\.message\.content\.some\(block => block\.type === 'thinking'\)/)
  assert.match(component, /\{t3\}/)
})
