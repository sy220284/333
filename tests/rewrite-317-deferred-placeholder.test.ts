import { test, expect, describe } from 'bun:test'
import {
  addDeferredToolPlaceholder317,
  DEFERRED_TOOL_PLACEHOLDER_NAME,
} from '../src/services/api/deferredToolPlaceholder317.js'

describe('317 API 私有延迟工具占位转换到333核心引擎', () => {
  const tool = (name: string) => ({
    name,
    description: name,
    input_schema: { type:'object' as const, properties:{} },
  })

  test('默认317动态工具协议保留原有工具顺序与终端缓存标志', () => {
    const tools=[tool('Read'),tool('Write'),tool('Edit')] as any[]
    addDeferredToolPlaceholder317(tools,true)
    expect(tools.map(x=>x.name)).toEqual(['Read','Write',DEFERRED_TOOL_PLACEHOLDER_NAME,'Edit'])
    expect(tools[2].defer_loading).toBe(true)
    expect(tools[2].input_schema).toEqual({type:'object',properties:{}})
  })
  test('标准模式与不兼容模型不添加延迟工具声明', () => {
    const tools=[tool('Read')] as any[]
    addDeferredToolPlaceholder317(tools,false)
    expect(tools.map(x=>x.name)).toEqual(['Read'])
  })
  test('同一请求重复设置占位项保持唯一', () => {
    const tools=[tool('Read'),tool('Bash')] as any[]
    addDeferredToolPlaceholder317(tools,true)
    addDeferredToolPlaceholder317(tools,true)
    expect(tools.filter(x=>x.name===DEFERRED_TOOL_PLACEHOLDER_NAME)).toHaveLength(1)
  })
})
