import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const source = path => readFileSync(join(root, path), 'utf8')

test('2.1.317 removes obsolete slash commands without removing Vim editor mode', () => {
  const registry = source('src/commands.ts')
  assert.doesNotMatch(registry, /commands\/vim\/index\.js|commands\/tag\/index\.js/)
  assert.doesNotMatch(registry, /^\s*(vim|tag),/m)
  const config = source('src/components/Settings/Config.tsx')
  assert.match(config, /id: 'editorMode'/)
  assert.match(config, /options: \['normal', 'vim'\]/)
})

test('/agents exposes the local collaboration center and an independent status command', () => {
  const index = source('src/commands/agents/index.ts')
  const implementation = source('src/commands/agents/agents.tsx')
  assert.match(index, /type: 'local-jsx'/)
  assert.match(index, /load: \(\) => import\('\.\/agents\.js'\)/)
  assert.match(implementation, /if \(verb === 'status'\)/)
  assert.match(implementation, /setAgentMode\(/)
  assert.match(implementation, /TeamCreateTool|team-create/)
  assert.match(implementation, /AgentCenter/)
})

test('2.1.317 suppresses redundant Agent classifier approval text but preserves other tool messages', () => {
  const view = source('src/components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx').split('//# sourceMappingURL=')[0]
  assert.match(view, /yoloReason && tool\.name !== 'Agent' && <MessageResponse/)
  assert.match(view, /Allowed by auto mode classifier/)
})

test('retired TaskOutput executable is absent; background outputs are still available through Read', () => {
  assert.equal(existsSync(join(root, 'src/tools/TaskOutputTool/TaskOutputTool.tsx')), false)
  assert.equal(existsSync(join(root, 'src/utils/task/outputFormatting.ts')), false)
  const registry = source('src/tools.ts')
  assert.doesNotMatch(registry, /TaskOutputTool/)
  assert.match(registry, /FileReadTool/)
  assert.match(source('src/utils/task/TaskOutput.ts'), /getTaskOutputPath/)
})

test('local command metadata flows through slash parser, QueryEngine and SDK result schema', () => {
  const processInput = source('src/utils/processUserInput/processUserInput.ts')
  const slash = source('src/utils/processUserInput/processSlashCommand.tsx')
  const query = source('src/QueryEngine.ts')
  const sdk = source('src/entrypoints/sdk/coreSchemas.ts')
  assert.match(processInput, /localCommand\?: string/)
  assert.match(slash, /localCommand: returnedCommand\.name/)
  assert.match(query, /num_turns: localCommand \? 0 : messages\.length - 1/)
  assert.match(query, /local_command: localCommand/)
  assert.match(sdk, /local_command: z\.string\(\)\.optional\(\)/)
})

test('retired teammate default-model setting is removed; new teammates inherit the leader model', () => {
  const config = source('src/components/Settings/Config.tsx')
  const settings = source('src/utils/config.ts')
  const spawn = source('src/tools/shared/spawnMultiAgent.ts')
  assert.doesNotMatch(config, /teammateDefaultModel|TeammateModel|getHardcodedTeammateModelFallback/)
  assert.doesNotMatch(settings, /teammateDefaultModel/)
  assert.doesNotMatch(spawn, /teammateDefaultModel|getHardcodedTeammateModelFallback/)
  assert.match(spawn, /return leaderModel \?\? getMainLoopModel\(\)/)
  assert.match(spawn, /process\.env\.CLAUDE_CODE_SUBAGENT_MODEL/)
  assert.match(spawn, /CLAUDE_CODE_SUBAGENT_MODEL_FORCE/)
  assert.match(config, /id: 'teammateMode'/)
})

test('obsolete startup toasts and permission footer hints are gone, operational error notices remain', () => {
  assert.equal(existsSync(join(root, 'src/hooks/useChromeExtensionNotification.tsx')), false)
  const ide = source('src/hooks/notifs/useIDEStatusIndicator.tsx').split('//# sourceMappingURL=')[0]
  const bash = source('src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx').split('//# sourceMappingURL=')[0]
  const powershell = source('src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx').split('//# sourceMappingURL=')[0]
  assert.equal(existsSync(join(root, 'src/hooks/useOfficialMarketplaceNotification.tsx')), false)
  assert.doesNotMatch(source('src/screens/REPL.tsx'), /useOfficialMarketplaceNotification/)
  assert.doesNotMatch(ide, /ide-status-hint|MAX_IDE_HINT_SHOW_COUNT|\/ide for/)
  assert.match(ide, /ide-status-install-error|ide-status-disconnected/)
  assert.doesNotMatch(bash, /ctrl\\+e to/)
  assert.doesNotMatch(powershell, /ctrl\\+e to/)
})

test('2.1.317 removes sandbox startup banners without losing status and sandbox controls', () => {
  const welcome = source('src/components/LogoV2/LogoV2.tsx').split('//# sourceMappingURL=')[0]
  const status = source('src/utils/status.tsx')
  const sandbox = source('src/components/sandbox/SandboxSettings.tsx')
  assert.doesNotMatch(welcome, /showSandboxStatus|SandboxManager|Bash 命令将在沙箱中运行/)
  assert.match(status, /SandboxManager/)
  assert.match(sandbox, /SandboxManager/)
})

test('new target removes stale refusal model and DNS cache auto-approval', () => {
  const errors = source('src/services/api/errors.ts')
  const api = source('src/services/api/claude.ts')
  const powershell = source('src/tools/PowerShellTool/readOnlyValidation.ts')
  assert.doesNotMatch(errors, /try running \/model claude-sonnet-4-20250514/)
  assert.match(errors, /content: baseMessage,/)
  assert.match(api, /getErrorMessageIfRefusal\(\s*part\.delta\.stop_reason,\s*\)/)
  assert.doesNotMatch(powershell, /['"]get-dnsclientcache['"]\s*:/)
  assert.doesNotMatch(powershell, /['"]\/displaydns['"]/)
  assert.match(powershell, /safeFlags: \['\/all', '\/allcompartments'\]/)
})

test('rebuilt /agents status uses the local collaboration center without a model turn', { timeout: 90000 }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'pr7-agents-retirement-'))
  const env = {
    ...process.env,
    HOME: folder,
    USERPROFILE: folder,
    XDG_CONFIG_HOME: folder,
    XDG_CACHE_HOME: folder,
    YAOYAOCHE_CONFIG_DIR: join(folder, '.yaoyaoche'),
    DISABLE_TELEMETRY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    NO_COLOR: '1',
  }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.ANTHROPIC_BASE_URL
  const targets = [['rebuilt', 'bun', [join(root, 'dist', 'cli.js')]]]
  try {
    for (const [label, command, prefix] of targets) {
      const args = [...prefix, '--print', '--bare', '--output-format', 'json', '/agents status']
      const run = spawnSync(command, args, {
        cwd: folder,
        env,
        encoding: 'utf8',
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      })
      assert.equal(run.error, undefined, `${label}: ${run.error?.message}`)
      assert.equal(run.status, 0, `${label}: ${run.stderr.slice(-1200)}`)
      const result = JSON.parse(run.stdout.trim())
      assert.equal(result.local_command, 'agents', `${label}: missing local command route`)
      assert.equal(result.num_turns, 0, `${label}: old wizard attempted model invocation`)
      assert.equal(result.is_error, false, `${label}: local command failed`)
      assert.match(result.result, /当前模式：/, `${label}: missing collaboration mode status`)
    }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
