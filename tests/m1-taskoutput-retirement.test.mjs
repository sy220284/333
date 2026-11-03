import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const source=p=>readFileSync(resolve(root,p),'utf8')

test('2.1.310 live tools no longer register TaskOutput, Read remains available',()=>{
  const registry=source('src/tools.ts')
  assert.doesNotMatch(registry,/TaskOutputTool/)
  assert.match(registry,/FileReadTool/)
  const selector=source('src/components/agents/ToolSelector.tsx')
  assert.doesNotMatch(selector,/TaskOutputTool/)
  assert.match(selector,/FileReadTool/)
})
test('removed TASK_MAX_OUTPUT_LENGTH no longer advertised as active /doctor setting',()=>{
  const doctor=source('src/screens/Doctor.tsx')
  assert.doesNotMatch(doctor,/TASK_MAX_OUTPUT_LENGTH/)
  assert.match(doctor,/BASH_MAX_OUTPUT_LENGTH/)
})
test('live mock model API test asserts TaskOutput is absent on both native and rebuilt CLI',()=>{
  const testSource=source('tests/upgrade-mode-integration.test.mjs')
  assert.match(testSource,/exposed\.includes\('TaskOutput'\)/)
  assert.match(testSource,/CLAUDE_2310_X64/)
})

test('background notifications never direct the model to the retired output tool',()=>{
  const messages=source('src/utils/messages.ts')
  assert.doesNotMatch(messages,/TASK_OUTPUT_TOOL_NAME/)
  assert.match(messages,/Send it a message with \$\{SEND_MESSAGE_TOOL_NAME\} to retrieve its result/)
  assert.match(messages,/Read the output file to retrieve the result/)
})
