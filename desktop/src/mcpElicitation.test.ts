import { describe, expect, it } from 'vitest'
import { prepareMcpElicitationContent } from './mcpElicitation'

describe('MCP 表单数据在接受前符合原始请求的字段语义', () => {
  const schema = { type:'object', required:['name','retries','confirmed'], properties:{
    name:{type:'string',minLength:2,maxLength:15},
    retries:{type:'integer',minimum:1,maximum:5},
    confirmed:{type:'boolean'},
    priority:{type:'integer',enum:[1,2,3]},
  } }
  it('拒绝缺少必填字段并允许纠正后重新提交', () => {
    expect(() => prepareMcpElicitationContent(schema,{})).toThrow('name')
    expect(() => prepareMcpElicitationContent(schema,{name:'报告'})).toThrow('retries')
    expect(() => prepareMcpElicitationContent(schema,{name:'报告',retries:2}))
      .not.toThrow()
  })
  it('保留数字枚举实际类型并将未勾选的布尔值按界面状态传递', () => {
    expect(prepareMcpElicitationContent(schema,{name:'报告',retries:3,priority:2}))
      .toEqual({name:'报告',retries:3,confirmed:false,priority:2})
  })
  it('拒绝无效数值、枚举、文本长度和复杂字段类型', () => {
    for (const [value,fragment] of [
      [{name:'a',retries:1},'name'],
      [{name:'报告',retries:1.5},'retries'],
      [{name:'报告',retries:0},'retries'],
      [{name:'报告',retries:2,priority:'2'},'priority'],
      [{name:'报告',retries:2,confirmed:'false'},'confirmed'],
    ] as const) {
      expect(() => prepareMcpElicitationContent(schema,value)).toThrow(fragment)
    }
    expect(() => prepareMcpElicitationContent({properties:{records:{type:'array'}}},{}))
      .toThrow('暂不支持')
  })
  it('清理未声明的旧字段并允许空表单', () => {
    expect(prepareMcpElicitationContent({}, {obsolete:'旧会话字段'})).toEqual({})
    expect(prepareMcpElicitationContent({properties:{a:{type:'string'}}},{a:'',unknown:'secret'}))
      .toEqual({})
    expect(() => prepareMcpElicitationContent({required:['missing']},{}))
      .toThrow('没有定义')
  })
})
