#!/usr/bin/env node
/**
 * 2.1.317 公开发行版行为：旧 `claude assistant` 专用向导已退场。
 * 同条件执行官方安装版和当前源码重建版的帮助入口，防止旧入口重新劫持参数。
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function arg(flag) {
  const i = process.argv.indexOf(flag)
  if (i < 0 || !process.argv[i + 1]) throw new Error(`缺少参数 ${flag}`)
  return process.argv[i + 1]
}

const reference = arg('--reference')
const candidate = arg('--candidate')
const report = arg('--report')
const home = mkdtempSync(join(tmpdir(), 'claude-assistant-parity-'))
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  XDG_CONFIG_HOME: join(home, '.config'),
  CLAUDE_CONFIG_DIR: join(home, '.claude'),
  DISABLE_AUTOUPDATER: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_TELEMETRY: '1',
  NO_COLOR: '1',
}
delete env.ANTHROPIC_API_KEY
delete env.ANTHROPIC_AUTH_TOKEN
delete env.ANTHROPIC_BASE_URL

function help(binary, args, label) {
  const run = spawnSync(binary, args, {
    encoding: 'utf8',
    env,
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
  })
  assert.equal(run.error, undefined, `${label}: ${run.error?.message}`)
  assert.equal(run.status, 0, `${label}: ${run.stderr.slice(-700)}`)
  assert.ok(run.stdout.startsWith(label.startsWith('candidate') ? 'Usage: yaoyaoche ' : 'Usage: claude '), `${label}: 缺少 CLI 帮助`)
  return run.stdout.replaceAll('\r\n', '\n').trim()
}
try {
  mkdirSync(env.XDG_CONFIG_HOME, { recursive: true })
  const refHelp = help(reference, ['--help'], 'official help')
  const refAssistantHelp = help(reference, ['assistant', '--help'], 'official assistant help')
  const candHelp = help(candidate, ['--help'], 'candidate help')
  const candAssistantHelp = help(candidate, ['assistant', '--help'], 'candidate assistant help')
  assert.equal(refAssistantHelp, refHelp, '官方版本仍暴露独立 assistant 命令，退场判断需要重新核实')
  assert.equal(candAssistantHelp, candHelp, '重建版仍劫持 assistant 参数，旧安装向导未退出公开版')
  const candidateGlobalHelpMatchesOfficial = candAssistantHelp === refAssistantHelp
  const optionNames = help => [...new Set(
    help.split('\n').flatMap(line => {
      const match = /^\s+(?:-\w,\s+)?(--[a-z0-9][a-z0-9-]*)\b/i.exec(line)
      return match ? [match[1]] : []
    }),
  )].sort()
  const referenceOptions = optionNames(refAssistantHelp)
  const candidateOptions = optionNames(candAssistantHelp)
  const missingPublicOptions = referenceOptions.filter(x => !candidateOptions.includes(x))
  const extraCandidateOptions = candidateOptions.filter(x => !referenceOptions.includes(x))
  assert.ok(referenceOptions.includes('--debug') && candidateOptions.includes('--debug'), '新版 debug 调试入口必须正常保留')
  assert.ok(!referenceOptions.includes('--mcp-debug') && !candidateOptions.includes('--mcp-debug'), '旧 MCP 调试入口已退场')
  assert.deepEqual(extraCandidateOptions, [], '候选版不能额外公开已退场的旧版参数')
  writeFileSync(report, `${JSON.stringify({
    target: '2.1.317',
    scenario: 'retired-assistant-command-help',
    reference_matches_general_help: true,
    candidate_matches_general_help: true,
    assistant_command_retirement_matches_reference: true,
    candidate_global_help_matches_reference: candidateGlobalHelpMatchesOfficial,
    missing_public_options: missingPublicOptions,
    extra_candidate_options: extraCandidateOptions,
  }, null, 2)}\n`)
  console.log(JSON.stringify({
    assistant_command_retirement_matches_reference: true,
    candidate_global_help_matches_reference: candidateGlobalHelpMatchesOfficial,
    missing_public_options: missingPublicOptions,
    extra_candidate_options: extraCandidateOptions,
  }))
} finally {
  rmSync(home, { recursive: true, force: true })
}
