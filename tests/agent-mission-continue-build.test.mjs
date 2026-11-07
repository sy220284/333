import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
test('明确继续指令读取任务记录后发起新对话，不在打开界面时自发执行', () => {
  const source = read('src/commands/agents/agents.tsx')
  assert.match(source, /action === 'continue'/)
  assert.match(source, /mission\.status !== 'active'/)
  assert.match(source, /submitNextInput: true/)
  assert.match(source, /nextInput,/)
  assert.match(source, /已有阶段记录/)
})
