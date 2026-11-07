import { expect,test } from 'bun:test'
import { CapabilityDraftTool } from '../src/tools/CapabilityDraftTool/CapabilityDraftTool.js'
import { getAllBaseTools } from '../src/tools.js'

test('智能体可提议技能，原生工具不提供自行发布或越权安装入口',()=>{
  const input=CapabilityDraftTool.inputSchema
  expect(input.safeParse({action:'list'}).success).toBe(true)
  expect(input.safeParse({action:'draft-skill',slug:'subtitle-check',
    description:'校验视频剪辑后字幕的时间轴和一致性',
    instructions:'用于检查视频字幕偏移。先核对时基，再读取现有字幕和音频，对首中尾三段进行验证，输出可复查的偏移报告和修改建议。'}).success).toBe(true)
  expect(input.safeParse({action:'publish',slug:'bad'}).success).toBe(false)
  expect(input.safeParse({action:'draft-skill',slug:'../unsafe'}).success).toBe(false)
  expect(CapabilityDraftTool.isReadOnly({action:'list'} as never)).toBe(true)
  expect(CapabilityDraftTool.isReadOnly({action:'draft-skill'} as never)).toBe(false)
  expect(getAllBaseTools().some(x=>x.name==='CapabilityDraft')).toBe(true)
})
