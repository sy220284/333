import {expect,test} from 'bun:test'
import {ExperienceTool} from '../src/tools/ExperienceTool/ExperienceTool.js'
import {getAllBaseTools} from '../src/tools.js'

test('模型只能查询或提炼候选，不具有批准经验的入口',()=>{
  const schema=ExperienceTool.inputSchema
  expect(schema.safeParse({action:'recall',query:'字幕时间轴'}).success).toBe(true)
  expect(schema.safeParse({action:'propose',draft:{}}).success).toBe(true)
  expect(schema.safeParse({action:'approve',id:'fake'}).success).toBe(false)
  expect(schema.safeParse({action:'retire',id:'fake'}).success).toBe(false)
  expect(ExperienceTool.isReadOnly({action:'recall'} as never)).toBe(true)
  expect(ExperienceTool.isReadOnly({action:'propose'} as never)).toBe(false)
  expect(getAllBaseTools().some(tool=>tool.name==='Experience')).toBe(true)
})
