/**
 * Executable architecture contract for the 2.1.317 migration.
 *
 * This checks production import edges (rather than file existence alone) and
 * the ordering of dedicated bootstrap routes before the interactive CLI.
 * Detailed semantic parity remains the responsibility of the M1-M6 tests.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const contracts = [
  ['M1', 'src/entrypoints/cli.tsx', 'src/main.tsx'],
  ['M1', 'src/entrypoints/cli.tsx', 'src/entrypoints/pluginTestFastPath317.ts'],
  ['M1', 'src/entrypoints/cli.tsx', 'src/bootstrap/preload317.ts'],
  ['M1', 'src/entrypoints/cli.tsx', 'src/bootstrap/bgSpare317.ts'],
  ['M1', 'src/entrypoints/cli.tsx', 'src/bootstrap/daemonWorker317.ts'],
  ['M1', 'src/entrypoints/pluginTestFastPath317.ts', 'src/cli/handlers/pluginTest317.ts'],
  ['M1', 'src/bootstrap/bgSpare317.ts', 'src/bootstrap/preload317.ts'],
  ['M1', 'src/bootstrap/preload317.ts', 'src/bootstrap/claimRebind317.ts'],
  ['M1', 'src/bootstrap/preload317.ts', 'src/bootstrap/providerClaimEnv317.ts'],
  ['M1', 'src/bootstrap/claimRebind317.ts', 'src/bootstrap/fastPathSettings317.ts'],
  ['M1', 'src/bootstrap/claimRebind317.ts', 'src/utils/config.ts'],
  ['M1', 'src/bootstrap/claimRebind317.ts', 'src/utils/settings/settingsCache.ts'],
  ['M1', 'src/bootstrap/claimRebind317.ts', 'src/utils/settings/mdm/rawRead.ts'],
  ['M1', 'src/bootstrap/claimRebind317.ts', 'src/utils/sessionStorage.ts'],
  ['M2', 'src/screens/REPL.tsx', 'src/query.ts'],
  ['M2', 'src/QueryEngine.ts', 'src/query.ts'],
  ['M3', 'src/query.ts', 'src/services/tools/StreamingToolExecutor.ts'],
  ['M3', 'src/services/tools/toolExecution.ts', 'src/services/mcp/client.ts'],
  ['M3', 'src/services/api/withRetry.ts', 'src/services/api/retryPolicy317.ts'],
  ['M3', 'src/tools/TaskStopTool/TaskStopTool.ts', 'src/tasks/stopTask.ts'],
  ['M4', 'src/tasks.ts', 'src/tasks/InProcessTeammateTask/InProcessTeammateTask.tsx'],
  ['M4', 'src/tasks/LocalShellTask/killShellTasks.ts', 'src/utils/sdkEventQueue.ts'],
  ['M4', 'src/tools/AgentTool/runAgent.ts', 'src/query.ts'],
  ['M4', 'src/utils/sessionStorage.ts', 'src/utils/sessionTranscriptPathsV5.ts'],
  ['M5', 'src/main.tsx', 'src/utils/plugins/pluginLoader.ts'],
  ['M6', 'src/cli/print.ts', 'src/QueryEngine.ts'],
  ['M6', 'src/entrypoints/cli.tsx', 'src/cli/selfHostedRunner/runnerHost317.ts'],
  ['M6', 'src/cli/selfHostedRunner/runnerHost317.ts', 'src/cli/selfHostedRunner/runnerApi317.ts'],
  ['M6', 'src/cli/selfHostedRunner/runnerHost317.ts', 'src/cli/selfHostedRunner/runnerWorkspace317.ts'],
  ['M6', 'src/cli/selfHostedRunner/runnerHost317.ts', 'src/bridge/sessionRunner.ts'],
]

function canonicalModule(path) {
  return path.replace(/\.(?:tsx?|mjs|js)$/, '')
}
function linkedPath(from, specifier) {
  const path = specifier.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(from), specifier))
    : specifier
  return canonicalModule(path)
}
function importTargets(source, path) {
  return [...source.matchAll(/\b(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)]
    .map(match => linkedPath(path, match[1]))
}

const cache = new Map()
function read(path) {
  if (!cache.has(path)) {
    const full = join(root, path)
    if (!existsSync(full)) throw new Error('Missing source module: ' + path)
    cache.set(path, readFileSync(full, 'utf8'))
  }
  return cache.get(path)
}

const failures = []
for (const [layer, from, target] of contracts) {
  try {
    const source = read(from)
    read(target)
    const targets = importTargets(source, from)
    if (!targets.includes(canonicalModule(target))) {
      failures.push(layer + ': ' + from + ' does not import ' + target)
    }
  } catch (error) {
    failures.push(layer + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

const cli = read('src/entrypoints/cli.tsx')
const normalEntry = cli.indexOf("await import('../main.js')")
for (const [label, needle] of [
  ['plugin test', 'runPluginTestFastPath317(args.slice(2))'],
  ['PTY worker', "args[0] === '--bg-pty-host'"],
  ['daemon worker', "args[0] === '--daemon-worker'"],
  ['background spare', "args[0] === '--bg-spare'"],
  ['preload', "args[0] === '--preload'"],
]) {
  const index = cli.indexOf(needle)
  if (normalEntry < 0 || index < 0 || index >= normalEntry) {
    failures.push('M1: ' + label + ' must dispatch before interactive main import')
  }
}

// Keep one CLI flag registration. Duplicate Commander options prevent the
// entire inference and tool execution process from starting.
const main = read('src/main.tsx')
const permissionPromptRegistrationCount = [
  ...main.matchAll(/(?:new Option|program\.option)\(['"]--permission-prompt-tool\s/g),
].length
if (permissionPromptRegistrationCount !== 1 ||
    !/new Option\('--permission-prompt-tool <tool>'[^\n]*\)\.argParser\(String\)\.hideHelp\(\)/.test(main) ||
    !main.includes('permissionPromptToolName: options.permissionPromptTool')) {
  failures.push('M3: --permission-prompt-tool requires one CLI registration and the headless consumer')
}
const headless = read('src/cli/print.ts')
if (!headless.includes('getCanUseToolFn(') ||
    !headless.includes('toolMatchesName(t, permissionPromptToolName)')) {
  failures.push('M2/M3: permission prompt MCP tool must reach its permission dispatcher')
}

// A warmed process may change config home while retaining the same cwd.
const claimRebind = read('src/bootstrap/claimRebind317.ts')
const invalidateConfigAt = claimRebind.indexOf('envUtils.getClaudeConfigHomeDir.cache.clear()')
const resetStorageAt = claimRebind.indexOf('await rebindSessionStorageForClaim317()')
if (invalidateConfigAt < 0 || resetStorageAt <= invalidateConfigAt ||
    !read('src/utils/sessionStorage.ts').includes('sessionTranscriptPaths.clear()')) {
  failures.push('M1/M4: claimed Storage V5 ownership must reset after config home invalidation')
}

if (failures.length) {
  for (const failure of failures) console.error('[317 architecture] ' + failure)
  process.exitCode = 1
} else {
  const layers = [...new Set(contracts.map(x => x[0]))]
  console.log('317 architecture: ' + contracts.length +
    ' production import links and ' + layers.join('/') +
    ' bootstrap order verified')
}
