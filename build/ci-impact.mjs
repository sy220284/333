#!/usr/bin/env node
/**
 * 按最近一次成功验收的提交累计计算影响范围。
 * 连续 push 的旧检查被取消时，后续检查仍覆盖这段时间内的全部改动。
 */
import { readFileSync, appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const SPECIALISTS = Object.freeze({
  'chinese-only-ui': [
    /^src\/(screens|components|themes?|styles?|i18n|locales)\//,
    /^src\/main\.tsx$/, /^tests\/.*(?:chinese|ui-|screen-reader)/,
  ],
  codeql: [
    /^src\/(security|permissions|auth)\//, /^tests\/.*security/,
    /^\.github\/workflows\/codeql\.yml$/,
  ],
  'desktop-communication': [
    /^src\/services\/(desktop|conversation)\//,
    /^src\/entrypoints\/desktopHost\.ts$/, /^tests\/(?:desktop-|conversation-headless)/,
    /^docs\/desktop-protocol\.md$/,
  ],
  'dev-quality': [
    /^(tsconfig|eslint|biome|prettier)[^/]*$/, /^tools\/dev\//,
    /^tests\/(?:ci-routing|ci-test-discovery)\.test\.mjs$/,
  ],
  'dev-toolchain': [
    /^tools\/dev\//, /^(package\.json|bun\.lockb?|package-lock\.json)$/,
    /^build\/(?:restore-dependencies|install-public-deps|compile-standalone|package-release)\.mjs$/,
  ],
  'governance-audit': [],
  'governance-security-probe': [
    /^src\/(security|permissions|auth)\//, /^src\/services\/(analytics|telemetry)\//,
    /^tests\/.*(?:permission|security|privacy|telemetry)/,
  ],
  'independent-models': [
    /^src\/(?:models?|providers?|api|services\/(?:models?|providers?|auth)|utils\/(?:model|provider|oauth|anthropic|chatgpt|deepseek|kimi|qwen|minimax|glm))/i,
    /^tests\/.*(?:model|provider|oauth|chatgpt|minimax|deepseek|qwen|kimi|glm)/i,
    /^docs\/model-provider/, /^src\/commands\/models?\//,
  ],
  'independent-product-cleanup': [
    /^src\/commands\/github\//, /^src\/utils\/review\//,
    /^tests\/(?:github-|brand-|independent-product|independent-ui)/,
    /^build\/audit-independent-sources\.mjs$/,
  ],
  'latest-stable-six-host': [],
  'local-feature-promotion': [
    /^src\/(proactive|coordinator|tasks|voice)\//,
    /^src\/tools\/(AgentTool|TeamCreateTool|TeamDeleteTool|ListAgentsTool|SendMessageTool|MissionTool|BriefTool|ScheduleCronTool)\//,
    /^src\/services\/mcp\//, /^src\/services\/extractMemories\//,
    /^src\/utils\/(?:agent|localCapabilities|crossSessionMessaging|livePeerSessions)/,
    /^src\/hooks\/(?:useScheduledTasks|useMergedTools|useVoice)/,
    /^tests\/(?:agent-|local-feature|local-mcp|local-voice|proactive)/,
  ],
  'local-privacy': [
    /^src\/services\/(analytics|telemetry|metrics|privacy)\//,
    /^src\/utils\/(?:telemetry|privacy|analytics|metrics)/,
    /^tests\/.*(?:privacy|telemetry|analytics|metrics)/,
  ],
  'm1-317-bootstrap-security': [
    /^src\/bootstrap\//, /^src\/cli\/background\//, /^tests\/m1-(?:317-bootstrap|startup|token)/,
  ],
  'm1-317-official-reference': [],
  'm1-evidence': [],
  'm1-official-x64-installed-parity': [],
  'm1-public-lock-sync': [
    /^(bun\.lockb?|package\.json|package-lock\.json)$/,
    /^build\/(?:restore-dependencies|install-public-deps|verify-bundled-assets)\.mjs$/,
    /^tools\/dev\/toolchain/,
  ],
  'm1-screen-reader-real-pty': [
    /^src\/(screens|components|ui)\//, /^tests\/.*(?:screen-reader|pty)/,
  ],
  'm1-sed-preview-parity': [
    /^src\/tools\/(BashTool|NotebookEditTool|EditTool)\//,
    /^tests\/.*(?:sed-preview|notebook|bash-edit)/,
  ],
  'm1-spinner-parity': [
    /^src\/(screens|components)\//, /^tests\/.*spinner/,
  ],
  'm2-prompt-functional-integration-317': [
    /^src\/(prompts|systemPrompt)\//,
    /^src\/utils\/systemPrompt\.ts$/, /^src\/QueryEngine\.ts$/,
    /^tests\/.*(?:prompt|system-prompt)/,
  ],
  'm6-self-hosted-runner-317': [
    /^src\/cli\/(selfHostedRunner|background)\//,
    /^src\/bridge\/sessionRunner\.ts$/,
    /^src\/bootstrap\/(socketOwnership317|ptyHost317|bgSpare317)\.ts$/,
    /^tests\/(?:m6-(?:self-hosted|runner)|m1-background)/,
  ],
  rebuild: [
    /^build\/(?:rebuild|compile-standalone|package-release|verify-bundled-assets)\.mjs$/,
    /^tests\/(?:distribution-isolation|release-integrity|rebuild)/,
  ],
  'sdk-stream-parity': [
    /^src\/(sdk|QueryEngine\.ts|services\/conversation\/headlessSession)/,
    /^tests\/.*(?:sdk|stream-json|stream-parity)/,
  ],
  'type-migration-pr7': [
    /^tsconfig/, /^tools\/dev\/(?:dev|toolchain)/,
    /^tests\/.*(?:type-migration|typescript|ts-conversion)/,
  ],
  'upgrade-direct-alignment': [
    /^build\/(?:restore-claude-api|check-architecture-links317)\.mjs$/,
    /^tests\/.*direct-alignment/,
  ],
  'upgrade-protection': [
    /^src\/services\/mcp\//, /^src\/skills\/mcp/,
    /^tests\/.*(?:mcp-v2|upgrade-protection)/,
  ],
})

export const WORKFLOWS = Object.freeze(Object.keys(SPECIALISTS))

export function routeChanges(paths, full = false) {
  const result = Object.fromEntries(WORKFLOWS.map(key => [key, full || key === 'governance-audit']))
  if (full) return result
  let matchedCode = false
  for (const path of paths) {
    for (const [name, patterns] of Object.entries(SPECIALISTS)) {
      if (patterns.some(pattern => pattern.test(path))) {
        result[name] = true
        matchedCode = true
      }
    }
    // A workflow edit must validate the affected workflow itself.
    const workflow = /^\.github\/workflows\/([^/]+)\.yml$/.exec(path)?.[1]
    if (workflow && Object.hasOwn(result, workflow)) result[workflow] = true
  }
  // Unknown production/test changes get the general cross-platform check.
  if (!matchedCode && paths.some(path => /^(src|tests|build)\//.test(path)))
    result['dev-quality'] = true
  // Dispatcher/selector changes require toolchain and quality validation.
  if (paths.some(path => /^(\.github\/workflows\/ci-on-demand\.yml|build\/ci-impact\.mjs|tests\/ci-routing\.test\.mjs)$/.test(path))) {
    result['dev-quality'] = true
    result['dev-toolchain'] = true
  }
  return result
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function validSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value)
}

function existsAndAncestor(base, head) {
  if (!validSha(base)) return false
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', base, head], { stdio: 'ignore' })
    return true
  } catch { return false }
}

export function selectBaseline(runs, number, head, isAncestor) {
  const related = runs.filter(run =>
    run.event === 'pull_request' &&
    validSha(run.head_sha) &&
    run.head_sha !== head &&
    (!run.pull_requests?.length || run.pull_requests.some(pr => pr.number === number))
  )
  const passed = related
    .filter(run => run.status === 'completed' && run.conclusion === 'success' && isAncestor(run.head_sha, head))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (passed.length) return { sha: passed[0].head_sha, reason: 'last-success' }
  // During a burst, retain ALL commits since the first cancelled run.
  const oldest = related
    .filter(run => isAncestor(run.head_sha, head))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  if (oldest) {
    try {
      const parent = git('rev-parse', oldest.head_sha + '^')
      if (existsAndAncestor(parent, head)) return { sha: parent, reason: 'first-pending-parent' }
    } catch { /* rewritten histories are handled by the complete PR diff below */ }
  }
  return null
}

async function workflowRuns(event, token) {
  if (!token) throw Error('需要 actions:read 的 GITHUB_TOKEN 读取历史验收记录')
  const repo = process.env.GITHUB_REPOSITORY
  const branch = event.pull_request.head.ref
  const entries = []
  for (let page = 1; page <= 10; page++) {
    const url = 'https://api.github.com/repos/' + repo +
      '/actions/workflows/ci-on-demand.yml/runs?event=pull_request&branch=' +
      encodeURIComponent(branch) + '&per_page=100&page=' + page
    const response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (response.status === 404) return []
    if (!response.ok) throw Error('查询 CI 历史失败：HTTP ' + response.status)
    const data = await response.json()
    const pageRuns = data.workflow_runs ?? []
    entries.push(...pageRuns)
    if (pageRuns.length < 100) break
    if (page === 10) throw Error('CI 历史超过 1000 条，需扩大分页范围才能保证累积改动完整')
  }
  return entries
}

function changedFiles(base, head) {
  const buffer = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACDMRT', '-z', base, head])
  return buffer.toString('utf8').split('\0').filter(Boolean)
}

export async function plan(event, token) {
  if (!event.pull_request) return { full: true, files: [], routes: routeChanges([], true), baseline: 'manual' }
  const full = event.pull_request.draft === false
  const head = event.pull_request.head.sha
  if (!validSha(head)) throw Error('PR head SHA 无效')
  if (full) return { full, files: [], routes: routeChanges([], true), baseline: 'review-ready' }
  const runs = await workflowRuns(event, token)
  const selection = selectBaseline(runs, event.pull_request.number, head, existsAndAncestor)
  let base = selection?.sha
  let reason = selection?.reason
  if (!base) {
    // First run / history reset: include all outstanding changes rather than omitting unverified edits.
    const baseRef = event.pull_request.base.ref
    const baseBranch = 'refs/remotes/origin/' + baseRef
    base = git('merge-base', baseBranch, head)
    reason = 'initial-pr-baseline'
  }
  const files = changedFiles(base, head)
  return { full, files, routes: routeChanges(files), baseline: reason + ':' + base }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const result = await plan(payload, process.env.GITHUB_TOKEN)
    const lines = ['full=' + String(result.full), 'baseline=' + result.baseline]
    for (const [name, enabled] of Object.entries(result.routes))
      lines.push(name.replaceAll('-', '_') + '=' + String(enabled))
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n')
    console.log(JSON.stringify({
      full: result.full, baseline: result.baseline,
      changedFiles: result.files,
      selected: Object.entries(result.routes).filter(([, active]) => active).map(([name]) => name),
    }, null, 2))
  } catch (error) {
    console.error('[ci-impact] 影响范围无法确定：' + String(error))
    process.exitCode = 1
  }
}
