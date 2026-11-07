import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { HandoffTool } from '../src/tools/HandoffTool/HandoffTool.js'
import { getAllBaseTools } from '../src/tools.js'

test('原生交接工具允许成员签收交付，禁止模型代替负责人验收', () => {
  const schema=HandoffTool.inputSchema
  expect(schema.safeParse({ action:'list' }).success).toBe(true)
  expect(schema.safeParse({ action:'acknowledge',handoffId:'wrong' }).success).toBe(false)
  expect(schema.safeParse({ action:'submit',handoffId:randomUUID(),
    outputRefs:['artifact:video:final'] }).success).toBe(true)
  expect(schema.safeParse({ action:'completed',handoffId:randomUUID() }).success).toBe(false)
  expect(HandoffTool.isReadOnly({ action:'list' } as never)).toBe(true)
  expect(HandoffTool.isReadOnly({ action:'submit' } as never)).toBe(false)
  expect(getAllBaseTools().some(tool=>tool.name==='Handoff')).toBe(true)
})
