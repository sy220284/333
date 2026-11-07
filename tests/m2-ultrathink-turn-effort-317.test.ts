import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Message } from '../src/types/message.js'
import { turnRequestsUltrathink, queuedTurnRequestsUltrathink } from '../src/query/turnEffort317.js'

const prompt=(text:string,meta=false):Message=>({
  type:'user',uuid:randomUUID(),timestamp:new Date().toISOString(),
  message:{role:'user',content:text},...(meta?{isMeta:true as const}:{})
})
const result=(text:string):Message=>({
  type:'user',uuid:randomUUID(),timestamp:new Date().toISOString(),
  sourceToolUseID:'tool-1',
  message:{role:'user',content:[{type:'tool_result',tool_use_id:'tool-1',content:text}]},
})

test('2.1.311#065 genuine current user ultrathink requests boost',()=>{
  expect(turnRequestsUltrathink([prompt('请 ultrathink 此方案')])).toBe(true)
  expect(turnRequestsUltrathink([prompt('请 ultrathink 此方案'),result('tool result')])).toBe(true)
  expect(turnRequestsUltrathink([prompt('普通提问'),prompt('请 ultrathink 此方案')])).toBe(true)
})

test('2.1.311#065 stale, metadata, quote and path references never boost later turns',()=>{
  expect(turnRequestsUltrathink([prompt('ultrathink'),prompt('改为普通回答')])).toBe(false)
  expect(turnRequestsUltrathink([prompt('普通回答'),prompt('ultrathink',true)])).toBe(false)
  expect(turnRequestsUltrathink([prompt('src/ultrathink/notes.ts')])).toBe(false)
  expect(turnRequestsUltrathink([prompt('参考 `ultrathink` 的字面含义')])).toBe(false)
  expect(turnRequestsUltrathink([result('ultrathink')])).toBe(false)
})

test('2.1.311#065 actual query model API receives turn-scoped xhigh; attachments state capability',()=>{
  const query=readFileSync(new URL('../src/query.ts',import.meta.url),'utf8')
  const attachments=readFileSync(new URL('../src/utils/attachments.ts',import.meta.url),'utf8')
  expect(query).toContain('turnRequestsUltrathink(params.messages)')
  expect(query).toContain("params.toolUseContext.agentId === undefined")
  expect(query).toContain("effortValue: ultrathinkForTurn ? 'xhigh' : appState.effortValue")
  expect(attachments).toContain("modelSupportsXHighEffort(model) ? 'xhigh' : 'high'")
})

test('2.1.311#065 an active user-queued ultrathink can lift subsequent model requests',()=>{
  expect(queuedTurnRequestsUltrathink([{mode:'prompt',value:'请 ultrathink 余下内容'}])).toBe(true)
  expect(queuedTurnRequestsUltrathink([{mode:'prompt',value:'ultrathink pasted data',preExpansionValue:'请整理贴入内容'}])).toBe(false)
  expect(queuedTurnRequestsUltrathink([{mode:'prompt',value:'仅需普通回答'}, {mode:'prompt',value:'ultrathink this'}])).toBe(true)
})
test('2.1.311#065 system-generated, unapproved and shell queued commands cannot lift effort',()=>{
  for(const entry of [
    {mode:'bash',value:'echo ultrathink'},
    {mode:'prompt',value:'ultrathink',isMeta:true},
    {mode:'prompt',value:'ultrathink',screeningPending:true},
    {mode:'prompt',value:'ultrathink',origin:{kind:'task-notification'}},
    {mode:'prompt',value:'参考 `ultrathink` 关键词'}
  ] as const) {
    expect(queuedTurnRequestsUltrathink([entry])).toBe(false)
  }
})
test('2.1.311#065 query latches mid-turn effort both before API calls and queue draining',()=>{
  const query=readFileSync(new URL('../src/query.ts',import.meta.url),'utf8')
  expect(query).toContain("ultrathinkForTurn = queuedTurnRequestsUltrathink(")
  expect(query).toContain("getCommandsByMaxPriority('next')")
  expect(query).toContain('queuedTurnRequestsUltrathink(queuedCommandsSnapshot)')
  expect(query).toContain("effortValue: ultrathinkForTurn ? 'xhigh' : appState.effortValue")
})
