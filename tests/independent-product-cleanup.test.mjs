import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parseReviewRequest } from '../src/commands/reviewMode.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
function source(path) { return readFileSync(join(root, path), 'utf8') }

test('统一代码审查区分普通、深度和安全模式', () => {
  assert.deepEqual(parseReviewRequest(''), { mode: 'normal', target: '' })
  assert.deepEqual(parseReviewRequest('deep 123'), { mode: 'deep', target: '123' })
  assert.deepEqual(parseReviewRequest('security my-branch'), { mode: 'security', target: 'my-branch' })
  assert.deepEqual(parseReviewRequest('普通 42'), { mode: 'normal', target: '42' })
  assert.deepEqual(parseReviewRequest('--mode=deep 123'), { mode: 'deep', target: '123' })
  assert.deepEqual(parseReviewRequest('--mode security 123'), { mode: 'security', target: '123' })
  assert.deepEqual(parseReviewRequest('feature/deep-update'), { mode: 'normal', target: 'feature/deep-update' })
})

test('正式菜单只提供统一入口及自主反馈', () => {
  const s = source('src/commands.ts')
  const commands = s.slice(s.indexOf('const COMMANDS ='), s.indexOf('export const builtInCommandNames'))
  for (const name of ['review', 'status', 'plan', 'tasks', 'feedback']) {
    assert.match(commands, new RegExp(`^  ${name},$`, 'm'), `缺少核心入口：${name}`)
  }
  for (const name of ['stickers','mobile','thinkback','thinkbackPlay','desktop','sendToProject','installSlackApp','installGitHubApp','passes','extraUsage','extraUsageNonInteractive','rateLimitOptions','ultrareview','securityReview','advisor','cost','stats','usage','workflowsCmd']) {
    assert.doesNotMatch(commands, new RegExp(`^  ${name},$`, 'm'), `仍注册官方或重复入口：${name}`)
  }
  assert.doesNotMatch(commands, /INTERNAL_ONLY_COMMANDS/)
})

test('已删除 Claude 商业推广、云审查及外部统计上传文件', () => {
  for (const path of [
    'src/commands/stickers/index.ts',
    'src/commands/mobile/index.ts',
    'src/commands/thinkback/index.ts',
    'src/commands/thinkback-play/index.ts',
    'src/commands/install-slack-app/index.ts',
    'src/commands/install-github-app/index.ts',
    'src/commands/send-to-project/index.ts',
    'src/commands/extra-usage/index.ts',
    'src/commands/rate-limit-options/index.ts',
    'src/commands/passes/index.ts',
    'src/services/analytics/datadog.ts',
    'src/services/analytics/firstPartyEventLoggingExporter.ts',
    'src/cli/handlers/ultrareview.ts',
    'src/services/api/ultrareviewQuota.ts',
    'src/services/api/referral.ts',
    'src/components/Passes/Passes.tsx',
    'src/components/DesktopUpsell/DesktopUpsellStartup.tsx',
  ]) assert.equal(existsSync(join(root,path)), false, `${path} 仍存在`)
  assert.doesNotMatch(source('src/main.tsx'), /program\.command\('ultrareview \[target\]'\)/)
})

test('云端实验、事件上报和会话上传均已关闭', () => {
  const firstParty = source('src/services/analytics/firstPartyEventLogger.ts')
  assert.match(firstParty, /function is1PEventLoggingEnabled\(\): boolean \{ return false \}/)
  assert.match(source('src/services/analytics/growthbook.ts'), /function isGrowthBookEnabled\(\): boolean \{[^}]*return false/s)
  assert.match(source('src/services/analytics/sink.ts'), /getLocalDiagnosticEventCounts/)
  const share = source('src/components/FeedbackSurvey/submitTranscriptShare.ts')
  assert.match(share, /success: false/)
  assert.doesNotMatch(share, /axios|fetch\(|https?:\/\//)
})

test('本地反馈导出要求显式描述，文件私密且不上传', () => {
  const src = source('src/commands/feedback/feedback.ts')
  assert.match(src, /if \(!description\)/)
  assert.match(src, /diagnostics/)
  assert.match(src, /mode: 0o600/)
  assert.match(src, /flag: 'wx'/)
  assert.doesNotMatch(src, /https?:\/\/|axios|fetch\(/)
})

test('状态、规划、后台任务统一入口连接原运行时', () => {
  const status = source('src/commands/status/RuntimeStatusPanel.tsx')
  for (const tab of ['overview','usage','context','cost','stats']) assert.ok(status.includes(`id="${tab}"`))
  assert.match(status, /getLocalDiagnosticEventCounts|buildDiagnostics/)
  const tasks = source('src/commands/tasks/tasks.tsx')
  assert.match(tasks, /BackgroundTasksDialog/)
  assert.match(tasks, /WorkflowHistoryDialog/)
  const plan = source('src/commands/plan/unified.tsx')
  assert.match(plan, /advisor\.load\(\)/)
  assert.match(plan, /import\('\.\/plan\.js'\)/)
})
