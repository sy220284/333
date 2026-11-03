import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const source = path => readFileSync(join(root, path), 'utf8')

test('2.1.310 removes obsolete slash commands without removing Vim editor mode', () => {
  const registry = source('src/commands.ts')
  assert.doesNotMatch(registry, /commands\/vim\/index\.js|commands\/tag\/index\.js/)
  assert.doesNotMatch(registry, /^\s*(vim|tag),/m)
  const config = source('src/components/Settings/Config.tsx')
  assert.match(config, /id: 'editorMode'/)
  assert.match(config, /options: \['normal', 'vim'\]/)
})

test('/agents retains the hidden instructions instead of loading the retired wizard', () => {
  const index = source('src/commands/agents/index.ts')
  assert.match(index, /type: 'local'/)
  assert.match(index, /isHidden: true/)
  assert.match(index, /supportsNonInteractive: true/)
  assert.doesNotMatch(index, /local-jsx|AgentsMenu|import\('\.\/agents\.js'\)/)
  assert.match(index, /\.claude\/agents\//)
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

test('official 2.1.310 and rebuilt CLI both resolve /agents locally without a model turn', { timeout: 90000 }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'pr7-agents-retirement-'))
  const env = {
    ...process.env,
    HOME: folder,
    USERPROFILE: folder,
    XDG_CONFIG_HOME: folder,
    XDG_CACHE_HOME: folder,
    CLAUDE_CONFIG_DIR: join(folder, '.claude'),
    DISABLE_TELEMETRY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    NO_COLOR: '1',
  }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.ANTHROPIC_BASE_URL
  const targets = [['rebuilt', 'bun', [join(root, 'dist', 'cli.js')]]]
  if (process.env.CLAUDE_2310_X64) targets.push(['official-x64', process.env.CLAUDE_2310_X64, []])
  try {
    for (const [label, command, prefix] of targets) {
      const args = [...prefix, '--print', '--bare', '--output-format', 'json', '/agents']
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
      assert.match(result.result, /\.claude\/agents\//, `${label}: missing agent config path`)
    }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
