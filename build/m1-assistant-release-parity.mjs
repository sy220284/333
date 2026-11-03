#!/usr/bin/env node
/**
 * 2.1.310 公开发行版行为：旧 `claude assistant` 专用向导已退场。
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
  assert.ok(run.stdout.startsWith('Usage: claude '), `${label}: 缺少 CLI 帮助`)
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
  assert.equal(candAssistantHelp, refAssistantHelp, '重建版 assistant 帮助与官方公开版不同')
  writeFileSync(report, JSON.stringify({
    target: '2.1.310',
    scenario: 'retired-assistant-command-help',
    reference_matches_general_help: true,
    candidate_matches_general_help: true,
    candidate_matches_reference: true,
  }, null, 2) + '\n')
  console.log('2.1.310 assistant 命令退场：官方和重建版严格对照通过')
} finally {
  rmSync(home, { recursive: true, force: true })
}
