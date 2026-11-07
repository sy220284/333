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
  for (const name of ['review', 'status', 'plan', 'tasks', 'feedback', 'github']) {
    assert.match(commands, new RegExp(`^  ${name},$`, 'm'), `缺少核心入口：${name}`)
  }
  for (const name of ['stickers','mobile','thinkback','thinkbackPlay','desktop','sendToProject','installSlackApp','installGitHubApp','passes','extraUsage','extraUsageNonInteractive','rateLimitOptions','ultrareview','securityReview','advisor','cost','stats','usage','workflowsCmd','heapDump']) {
    assert.doesNotMatch(commands, new RegExp(`^  ${name},$`, 'm'), `仍注册官方或重复入口：${name}`)
  }
  assert.doesNotMatch(source('src/commands.ts'), /INTERNAL_ONLY_COMMANDS|agents-platform\/index\.js|commands\/mock-limits\/index\.js/)
})

test('官方云远控、定时、同步及Slack机器人不能重新注册命令', () => {
  const commands=source('src/commands.ts')
  const registered=commands.slice(commands.indexOf('const COMMANDS ='),commands.indexOf('export const builtInCommandNames'))
  for(const name of ['remoteControl','schedule','designSync','installSlackApp','teleport','ultrareview']) {
    assert.doesNotMatch(registered,new RegExp(`^\\s+${name}\\s*,?\\s*$,'m'),`已退役原厂命令重新进入菜单：${name}`)
  }
  const cli=source('src/main.tsx')
  for(const name of ['remote-control','schedule','ultrareview','teleport']) {
    assert.doesNotMatch(cli,new RegExp(`\\.command\\(['"]${name}(?:\\s|['"])`),`官方云端命令再次注册：${name}`)
  }
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
  const features = source('src/services/analytics/growthbook.ts')
  assert.doesNotMatch(features, /new GrowthBook\(|remoteEval: true|apiHost: baseUrl/)
  assert.match(features, /readLocalFeature/)
  assert.match(source('src/services/analytics/sink.ts'), /getLocalDiagnosticEventCounts/)
  const share = source('src/components/FeedbackSurvey/submitTranscriptShare.ts')
  assert.match(share, /success: false/)
  assert.doesNotMatch(share, /axios|fetch\(|https?:\/\//)
})

test('本地反馈导出要求显式描述，文件私密且不上传', () => {
  const src = source('src/commands/feedback/feedback.ts')
  assert.match(src, /if \(!description\)/)
  assert.match(src, /diagnostics/)
  const storage = source('src/services/localRuntime/feedbackReports.ts')
  assert.match(src, /saveLocalFeedback\(description, diagnostics\)/)
  assert.match(storage, /mode: 0o600/)
  assert.match(storage, /flag: 'wx'/)
  assert.doesNotMatch(src, /https?:\/\/|axios|fetch\(/)
  assert.doesNotMatch(storage, /https?:\/\/|axios|fetch\(/)
})

test('状态、规划、后台任务统一入口连接原运行时', () => {
  const status = source('src/commands/status/RuntimeStatusPanel.tsx')
  for (const tab of ['overview','usage','context','cost','stats','chatgpt']) assert.ok(status.includes(`id="${tab}"`))
  assert.match(status, /getLocalDiagnosticEventCounts|buildDiagnostics/)
  assert.match(status, /ChatGPTAccountsTab|chatGPTStatus\(\)/)
  const tasks = source('src/commands/tasks/tasks.tsx')
  assert.match(tasks, /BackgroundTasksDialog/)
  assert.match(tasks, /WorkflowHistoryDialog/)
  const plan = source('src/commands/plan/unified.tsx')
  assert.match(plan, /review cross/)
  assert.doesNotMatch(plan, /advisor\.load\(\)/)
  assert.match(plan, /import\('\.\/plan\.js'\)/)
})

test('会话分析彻底本地化且不包含内部员工反馈和外部字体请求', () => {
  const report = source('src/commands/insights.ts')
  for (const removed of [
    's3://anthropic-serve',
    'atamkin/cc-user-reports',
    'USER_TYPE === \'ant\'',
    'cc_team_improvements',
    'model_behavior_improvements',
    'teamFeedbackHtml',
    'fonts.googleapis.com',
    'section-feedback',
  ]) {
    assert.equal(report.includes(removed), false, `会话报告仍有官方内部残留：${removed}`)
  }
  for (const retained of [
    'generateHtmlReport(aggregated, insights)',
    "join(getDataDir(), 'report.html')",
    'mode: 0o600',
    "args?.split(/\\s+/).includes('--model-analysis')",
    '摇摇车使用分析',
    '本地分析报告已保存',
  ]) {
    assert.ok(report.includes(retained), `会话报告丢失本地功能：${retained}`)
  }
})

test('语音转写保持本地执行且音频文件临时写盘', () => {
  const voice = source('src/services/voiceStreamSTT.ts')
  assert.match(voice, /YAOYAOCHE_WHISPER_CLI/)
  assert.match(voice, /YAOYAOCHE_WHISPER_MODEL/)
  assert.match(voice, /execFileAsync\(configured\.executable/)
  assert.match(voice, /mode: 0o600/)
  assert.match(voice, /await rm\(dir, \{ recursive: true, force: true \}\)/)
  assert.doesNotMatch(voice, /speech_to_text\/voice_stream|wss:\/\/|fetch\(/)
})
