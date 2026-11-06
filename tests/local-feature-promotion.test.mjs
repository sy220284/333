import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('正式构建启用本地功能，剔除官方远控', () => {
  const line = source('build/rebuild.mjs').match(/features:\s*\[([^\]]+)\]/)?.[1]
  assert.ok(line, '无法读取正式编译开关')
  for (const name of ['MCP_SKILLS', 'QUICK_SEARCH', 'EXTRACT_MEMORIES', 'AGENT_TRIGGERS', 'KAIROS_BRIEF']) {
    assert.ok(line.includes("'"+name+"'"), name + ' 未进入构建')
  }
  for (const retired of ['BRIDGE_MODE', 'CCR_REMOTE_SETUP', 'VOICE_MODE', 'ULTRAPLAN']) {
    assert.ok(!line.includes("'"+retired+"'"), retired + ' 仍进入构建')
  }
})
test('历史云实验缓存不参与功能决策', () => {
  const code = source('src/services/analytics/growthbook.ts')
  assert.match(code, /getConfigOverrides\(\)/)
  assert.match(code, /cachedGrowthBookFeatures: _retired/)
  assert.doesNotMatch(code, /function getCachedFeatures/)
  assert.match(code, /return defaultValue/)
})
test('自动记忆与定时任务需要用户明确开启和授权', () => {
  const memory = source('src/services/extractMemories/extractMemories.ts')
  const cron = source('src/tools/ScheduleCronTool/prompt.ts')
  const create = source('src/tools/ScheduleCronTool/CronCreateTool.ts')
  assert.match(memory, /CLAUDE_CODE_ENABLE_LOCAL_MEMORY_EXTRACTION/)
  assert.doesNotMatch(memory, /tengu_passport_quail/)
  assert.match(cron, /CLAUDE_CODE_ENABLE_CRON/)
  assert.doesNotMatch(cron, /tengu_kairos_cron/)
  assert.match(create, /behavior:\s*'ask'/)
  assert.match(create, /type:\s*'safetyCheck'/)
  assert.match(memory, /isLocalCapabilityEnabled\('auto-memory'\)/)
  assert.match(cron, /isLocalCapabilityEnabled\('scheduled-tasks'\)/)
  assert.match(source('src/commands.ts'), /localFeatures,/)
  const scheduler = source('src/hooks/useScheduledTasks.ts')
  assert.match(scheduler, /useSyncExternalStore\(onGrowthBookRefresh, isKairosCronEnabled/)
})
test('本地会话发现与简报功能不需要账号云门控', () => {
  const listing = source('src/tools/ListAgentsTool/ListAgentsTool.ts')
  const brief = source('src/tools/BriefTool/BriefTool.ts')
  const commands = source('src/commands.ts')
  assert.doesNotMatch(listing, /discoverAuthenticatedPeers|rememberAccountRecipients|getCurrentPeerIdentityKey/)
  assert.match(listing, /const sessions = localSessions/)
  assert.doesNotMatch(brief, /tengu_kairos_brief/)
  assert.doesNotMatch(commands, /remoteEnv/)
  assert.doesNotMatch(commands, /commands\/know\.js/)
  assert.doesNotMatch(source('src/query/stopHooks.ts'), /scheduleKnowledgeNudge317/)
  const send = source('src/tools/SendMessageTool/SendMessageTool.ts')
  assert.doesNotMatch(send, /getCurrentPeerIdentityKey|resolveAdvertisedRemoteRecipient|postInterClaudeMessage/)
  assert.match(send, /resolveLocalPeerRecipient/)
})
