import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (file: string) => readFileSync(join(import.meta.dir, '..', file), 'utf8')
describe('独立产品功能入口', () => {
  it('保留核心用户命令并移除官方云专属入口', () => {
    const commands = source('src/commands.ts')
    for (const local of ["import plan from", "import tasks from", "import review from", "import status from", "import privacySettings from", "import effort from", "import btw from"]) {
      expect(commands).toContain(local)
    }
    for (const old of ["remote-env/index", "remote-setup/index", "commands/bridge/index", "commands/chrome/index", "commands/fast/index"]) {
      expect(commands).not.toContain(old)
    }
    expect(commands).toContain("import voice from './commands/voice/index.js'")
    const localVoice = source('src/commands/voice/index.ts')
    expect(localVoice).toContain('YAOYAOCHE_WHISPER_CLI')
    expect(localVoice).toContain('YAOYAOCHE_WHISPER_MODEL')
    expect(localVoice).not.toContain('getClaudeAIOAuthTokens')
    expect(localVoice).not.toContain("availability: ['claude-ai']")
  })
  it('启动不再主动发送探测额度的模型请求', () => {
    expect(source('src/main.tsx')).not.toContain('checkQuotaStatus()')
    expect(source('src/services/claudeAiLimits.ts')).not.toContain("content: 'quota'")
  })
  it('正文中的关键词不触发旧云规划', () => {
    const input = source('src/utils/processUserInput/processUserInput.ts')
    expect(input).not.toContain('hasUltraplanKeyword')
    expect(input).not.toContain('tengu_ultraplan_keyword')
  })
})
