import { test,expect,describe } from 'bun:test'
import { build317AgentPrompt } from '../src/constants/agentPrompt317.js'

describe('317 Agent SDK 提示词按333已有功能接口重写', () => {
  test('单段指令保留用户目标、工具边界、工作区和版本信息', () => {
    const text=build317AgentPrompt({
      model:'claude-sonnet-5-5',
      cwd:'/tmp/my-project',
      availableTools:['Read','Edit','Bash'],
    })
    expect(text).toContain('agent working with the user toward their goals')
    expect(text).toContain('permitted assessments')
    expect(text).toContain('user\'s permissions')
    expect(text).toContain('/tmp/my-project')
    expect(text).toContain('Read, Edit, Bash')
    expect(text).toContain('claude-sonnet-5-5')
  })
  test('现有记忆、MCP与用户语言设置注入同一提示词而非多次建段', () => {
    const text=build317AgentPrompt({
      model:'sonnet',
      cwd:'/workspace',
      availableTools:['Read'],
      memoryPath:'/workspace/.claude/memory',
      mcpGuidance:'Use approval before running external tools',
      languageGuidance:'Write in Chinese',
      outputStyleGuidance:'Use short paragraphs',
      extraDirectories:['/workspace/vendor'],
    })
    for(const phrase of ['.claude/memory','approval','Write in Chinese','short paragraphs','/workspace/vendor']){
      expect(text).toContain(phrase)
    }
    expect(text).not.toContain('SYSTEM_PROMPT_DYNAMIC_BOUNDARY')
  })
  test('无持久记忆时省略记忆路径并保留基本安全要求', () => {
    const text=build317AgentPrompt({model:'sonnet',cwd:'/workspace',availableTools:[]})
    expect(text).not.toContain('Persistent project memory')
    expect(text).toContain('For destructive changes')
  })
})
