import { createServer } from 'node:net'
import { mkdirSync, unlinkSync, writeFileSync, chmodSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { clearInheritedHostProviderEnvironment317 } from './providerClaimEnv317.ts'
import { assertSocketVacant317 } from './socketOwnership317.ts'

/**
 * 2.1.317 Linux-x64 cli.js --preload and chunk-dzajqkwk.js:
 * A warm process claims a single newline-framed session over an AF_UNIX
 * socket, restores the session environment/argv/cwd, then enters the CLI.
 * This entrypoint is intentionally independent from the ordinary REPL init.
 */
export const DEFAULT_PRELOAD_SOCKET_317 = '/home/claude/.claude/remote/spare.sock'
const MAX_CLAIM_BYTES = 8 * 1024 * 1024
// Verified upstream 317 Y$i: empty names, '=' and controls are invalid.
const INVALID_ENV_NAME_317 = /^$|[=\x00-\x1f\x7f-\x9f]/
/** Exact 2.1.317 chunk-9qvrfvhr.js DAe reset list: 113 literals, plus
 * CAo's two names and ZWe (host skill catalog). Remove inherited session
 * state before preload dependencies initialize and again on claim replay. */
export const PRELOAD_RESET_KEYS_317 = Object.freeze([
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
  'CLAUDE_CODE_WORKER_EPOCH', 'CLAUDE_CODE_CCR_EARLY_HYDRATE_PREFETCH',
  'CLAUDE_CODE_CCR_EARLY_REMOTE_CONNECT', 'CLAUDE_CODE_CCR_WORKER_SOCKET',
  'CLAUDE_CODE_CCR_OWN_CONNECTION_POOL', 'CLAUDE_CODE_CCR_EARLY_PLUGINS_SYNC',
  'CLAUDE_CODE_CCR_EARLY_SKILLS_SYNC', 'CLAUDE_CODE_CCR_EARLY_SYNC_AFTER_SETTINGS_REFUSAL',
  'CLAUDE_CODE_SYNC_PLUGINS_DOWNLOAD_CONCURRENCY', 'CLAUDE_CODE_CCR_FOLD_FIRST_TURN_RESCAN',
  'CLAUDE_CODE_CCR_ONE_PLUGIN_LOAD_PER_RELOAD', 'CLAUDE_CODE_CCR_SLOW_SKILLS_WATCH',
  'CLAUDE_CODE_MCP_REGISTRY_FETCH_AT_STARTUP', 'CLAUDE_CODE_MCP_ALWAYS_LOAD_JOIN_BEFORE_INPUT',
  'CLAUDE_CODE_CHROME_LATE_MCP_SERVER', 'CLAUDE_CODE_MCP_SKIP_UNCHANGED_RELIST',
  'CLAUDE_CODE_GROWTHBOOK_KICK_FROM_INIT', 'CLAUDE_CODE_GROWTHBOOK_KICK_ON_WARM_CACHE',
  'CLAUDE_CODE_SKIP_MCP_DEBUG_LOG_FILES', 'CLAUDE_CODE_MCP_NO_REDIAL_AFTER_POLICY_REFUSAL',
  'CLAUDE_CODE_SLEEP_COMPACT', 'CLAUDE_CODE_SLEEP_COMPACT_AFTER_MS',
  'CLAUDE_CODE_RESUME_SESSIONSTART_HOOKS_WAIT_MS', 'CLAUDE_CODE_JIT_POLICY_AFTER_STARTUP',
  'CLAUDE_CODE_PLAIN_DELTA_FAST_PATH', 'CLAUDE_CODE_PLAIN_DELTA_DIRECT_WRITE',
  'CLAUDE_CODE_PLAIN_DELTA_TAKE_AT_SOURCE', 'CLAUDE_CODE_INCREMENTAL_REQUEST_BODY',
  'CLAUDE_CODE_UNWATCHED_REPLY_HOLD_MS', 'CLAUDE_CODE_REMOTE_STALL_CHECK_INTERVAL_MS',
  'CLAUDE_CODE_CCR_SKIP_FRESH_MIGRATIONS', 'CLAUDE_CODE_ATTACHMENTS_IN_USER_DATA',
  'CLAUDE_CODE_TRANSCRIPT_SLIM_TOOL_RESULTS', 'CLAUDE_CODE_MANAGED_CONFIG_PREFETCH',
  'CLAUDE_CODE_BRIDGE_SESSION_ID', 'CLAUDE_CODE_BRIDGE_OWNER_ACCOUNT_UUID',
  'CLAUDE_CODE_BRIDGE_OWNER_ORG_UUID', 'CLAUDE_CODE_BRIDGE_SOURCE_DIR',
  'CLAUDE_CODE_RESUME_INTERRUPTED_TURN', 'CLAUDE_CODE_RESUME_INTERRUPTED_TURN_MAX_AGE_MS',
  'CLAUDE_CODE_RESUME_PROMPT', 'CLAUDE_CODE_RESUME_SHOWS_CUT_OFF_CALLS',
  'CLAUDE_CODE_RESUME_REASON', 'CLAUDE_RELAUNCH_SESSION_ADD_DIRS',
  'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SESSION_ORIGIN',
  'CLAUDE_CODE_SESSION_BEGAN_AS_COPY', 'CLAUDE_CODE_WITTY_DEWDROP',
  'CLAUDE_CODE_FIZZY_GROVE', 'CLAUDE_CHROME_TAB_GROUP_KEY',
  'SYSTEM_REMINDER_MEMORY_CONTEXT', 'CLAUDE_CODE_MEMORY_CONTEXT_NO_WAIT',
  'CLAUDE_CODE_MEMORY_SUBAGENT_APPEND', 'CLAUDE_CODE_POST_TURN_MEMORY',
  'CLAUDE_CODE_POST_TURN_MEMORY_CONFIG', 'CLAUDE_CODE_POST_TURN_MEMORY_SYNC',
  'CLAUDE_CODE_CCR_EVENT_FLUSH_POLICY', 'CLAUDE_CODE_POLL_EVENT_DECLARATIONS',
  'CLAUDE_CODE_APPEND_PROMPT_HEAD', 'CLAUDE_CODE_SYNC_SESSION_REFS',
  'CLAUDE_CODE_REMOTE_SESSION_ID', 'CLAUDE_CODE_REMOTE_SDK_URL',
  'CLAUDE_CODE_TRIGGER_ID', 'CLAUDE_CODE_BASE_REF',
  'CLAUDE_CODE_BASE_REFS', 'CLAUDE_CODE_REPO_CHECKOUTS',
  'CLAUDE_CODE_DIAGNOSTICS_FILE', 'CLAUDE_SESSION_INGRESS_TOKEN_FILE',
  'CLAUDE_CODE_WORKFLOW_LAUNCH_SHA256', 'CLAUDE_CODE_COWORK_FRAME_ARTIFACTS',
  'CLAUDE_CODE_HOST_SCHEDULED_RUN', 'CLAUDE_CODE_ARTIFACT_SHARE',
  'CLAUDE_CODE_ARTIFACT_VERSIONS', 'CLAUDE_CODE_HOST_GUARDS_ARTIFACTS_MCP',
  'CLAUDE_CODE_AUTOUPDATER_DISABLED_BY_HOST', 'CLAUDE_CODE_REMOTE_TOOLS_HOST_ALLOWS_UNATTENDED',
  'CLAUDE_CODE_REMOTE_TOOLS_HOST_IDLE_RELEASE_MINUTES', 'CLAUDE_CODE_SKILL_PROPOSALS',
  'CLAUDE_CODE_EVAL_CONFINED', 'CLAUDE_CODE_EVAL_ARTIFACT_STUB_DIR',
  'CLAUDE_CODE_EVAL_ALLOW_ARTIFACT_PUBLISH', 'CLAUDE_CODE_EVAL_ALLOW_FLAG_OVERRIDES',
  'CLAUDE_CODE_QUESTION_EXTENDED', 'CLAUDE_CODE_QUESTION_OPTIONAL_DESCRIPTIONS',
  'CLAUDE_CODE_MCP_APPS_HOST', 'CLAUDE_CODE_UPFRONT_TOOLS',
  'CLAUDE_CODE_PROGRAM_USE_CASE_ID', 'CLAUDE_CODE_ATTACHMENTS_BY_PATH',
  'CLAUDE_CODE_AGENT_PROGRESS_SUMMARIES', 'CLAUDE_CODE_HOST_PROMPT_SUPERSEDES_RECORD',
  'CLAUDE_CODE_HOST_WORKTREE', 'CLAUDE_CODE_HOST_WORKTREE_FENCE',
  'CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH', 'CLAUDE_CODE_SDK_HAS_SESSIONS_OAUTH_REFRESH',
  'CLAUDE_CODE_SDK_READS_SESSION_STATE', 'CLAUDE_CODE_SDK_READS_STARTUP_MARKS',
  'CLAUDE_CODE_BRIDGE_CHILD_AUTO_DEFAULT', 'CLAUDE_CODE_BRIDGE_CHILD_ARTIFACT',
  'CLAUDE_CODE_BRIDGE_CHILD_MACHINE_SETTINGS', 'CLAUDE_CODE_BRIDGE_CHILD_PROJECTS_ENTRYPOINT',
  'CLAUDE_CODE_BRIDGE_CHILD_CLI_ENTRYPOINT', 'SESSION_INGRESS_URL',
  'CCR_SESSION_PROFILE', 'CLAUDE_RUNNER_ALIVE_EVERY_MS',
  'CLAUDE_RUNNER_ACTIVITY_FD', 'CLAUDE_RUNNER_UPDATE_BIN',
  'CLAUDE_CODE_REMOTE_MCP_CONFIG', 'CLAUDE_CODE_WARN_DISK_FREE_GIB',
  'CLAUDE_CODE_WARN_MEMORY_FREE_GIB', 'CCR_BYOC_RESOURCE_WATCHDOG_TELEMETRY',
  'CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS', 'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_HOST_SKILL_CATALOG'
])

function unlinkIfPresent(path: string): void {
  try { unlinkSync(path) }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

export type PreloadEnvironmentResult317 = {
  kept: Record<string, string>
  dropped: Array<{name: string; problem: 'invalid-name' | 'non-string-value' | 'nul-in-value'}>
}
export type PreloadValidatedClaim317 = {
  cwd: string
  argv: string[]
  env: Array<[string, string]>
  dropped: PreloadEnvironmentResult317['dropped']
}
export type PreloadClaimApplyOptions317 = {
  env?: NodeJS.ProcessEnv
  argv?: string[]
  chdir?: (path: string) => void
}
/** Original 317 rhr() drops individual invalid env keys and accepts other valid keys. */
export function filterPreloadEnvironment317(environment: Record<string, unknown>): PreloadEnvironmentResult317 {
  // Null prototype preserves an own '__proto__' key from JSON safely.
  const kept: Record<string, string> = Object.create(null)
  const dropped: PreloadEnvironmentResult317['dropped'] = []
  for (const [name, value] of Object.entries(environment)) {
    if (INVALID_ENV_NAME_317.test(name)) {
      dropped.push({ name, problem: 'invalid-name' })
    } else if (typeof value !== 'string') {
      dropped.push({ name, problem: 'non-string-value' })
    } else if (value.includes(String.fromCharCode(0))) {
      dropped.push({ name, problem: 'nul-in-value' })
    } else {
      kept[name] = value
    }
  }
  return { kept, dropped }
}

export function validatePreloadClaim317(claim: PreloadClaim317): PreloadValidatedClaim317 {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim))
    throw new Error('Preload claim must be an object')
  if (typeof claim.cwd !== 'string' || !claim.cwd)
    throw new Error('Preload claim requires cwd')
  if (!Array.isArray(claim.argv) || !claim.argv.every(value => typeof value === 'string'))
    throw new Error('Preload claim requires argv strings')
  if (!claim.env || typeof claim.env !== 'object' || Array.isArray(claim.env))
    throw new Error('Preload claim requires env object')
  const { kept, dropped } = filterPreloadEnvironment317(claim.env)
  return { cwd: realpathSync(claim.cwd), argv: claim.argv, env: Object.entries(kept), dropped }
}

export function applyPreloadClaim317(claim: PreloadClaim317, {
  env = process.env, argv = process.argv, chdir = process.chdir.bind(process),
}: PreloadClaimApplyOptions317 = {}): PreloadValidatedClaim317 {
  const normalized = validatePreloadClaim317(claim)
  chdir(normalized.cwd)
  // Managed-host claims drop the warm process's stale inference routing.
  clearInheritedHostProviderEnvironment317(Object.fromEntries(normalized.env), env)
  for (const name of PRELOAD_RESET_KEYS_317) delete env[name]
  // The official claim replaces token values with those provided by the
  // session; credentials inherited from a different warmed session must go.
  for (const name of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'])
    delete env[name]
  for (const [name, value] of normalized.env) env[name] = value
  argv.splice(2, argv.length - 2, ...normalized.argv)
  return normalized
}

export type PreloadClaim317 = {
  cwd: string; argv: string[]; env: Record<string, unknown>; sessionId?: unknown
}

/** Shared 317 post-claim state restoration for --preload and authenticated --bg-spare. */
export async function runClaimedSession317(claim: PreloadClaim317,
  source: string = 'spare_claim'): Promise<void> {
  applyPreloadClaim317(claim)
  const state = await import('./state.js')
  const claimedCwd = process.cwd()
  state.setOriginalCwd(claimedCwd)
  state.setProjectRoot(claimedCwd)
  state.setCwdState(claimedCwd)
  if (typeof claim.sessionId === 'string' && claim.sessionId) {
    const { asSessionId } = await import('../types/ids.js')
    state.switchSession(asSessionId(claim.sessionId))
    state.setSessionSource(source)
  }
  // The accepted session must not reuse the warm process's settings,
  // credentials, global config watcher or provider caches.
  const { rebindClaimedSessionDependencies317 } = await import('./claimRebind317.ts')
  await rebindClaimedSessionDependencies317()
  const { main } = await import('../main.js')
  await main()
}

export async function runPreload317(args: string[] = process.argv.slice(2), {
  onClaim = runClaimedSession317,
}: { onClaim?: (claim: PreloadClaim317, source?: string) => Promise<void>; } = {}) : Promise<void> {
  // Original preload clears the previous session's transient environment
  // before any warming imports or socket activity can observe it.
  for (const name of PRELOAD_RESET_KEYS_317) delete process.env[name]
  const socketPath = args[0] || DEFAULT_PRELOAD_SOCKET_317
  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 })
  await assertSocketVacant317(socketPath, 'Preload')
  const pidPath = socketPath + '.pid'
  let server
  let ownsSocket = false
  let ownsPid = false
  let finished = false
  let resolveClaim
  let rejectClaim
  const claimPromise = new Promise<PreloadClaim317>((resolve, reject) => {
    resolveClaim = resolve; rejectClaim = reject
  })
  const cleanup = () => {
    if (ownsPid) { ownsPid = false; unlinkIfPresent(pidPath) }
    if (ownsSocket) { ownsSocket = false; unlinkIfPresent(socketPath) }
  }
  const interrupted = () => {
    cleanup()
    process.exit(0)
  }
  const onUnhandled = error => {
    cleanup()
    process.stderr.write('[preload] uncaughtException: ' + String(error) + '\n')
    process.exit(1)
  }
  for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(signal, interrupted)
  process.on('uncaughtException', onUnhandled)
  try {
    server = createServer(socket => {
      let buffer = ''
      socket.setEncoding('utf8')
      socket.on('data', chunk => {
        if (finished) return
        buffer += chunk
        if (Buffer.byteLength(buffer, 'utf8') > MAX_CLAIM_BYTES) {
          socket.destroy(new Error('Preload claim exceeded maximum size'))
          return
        }
        const end = buffer.indexOf('\n')
        if (end === -1) return
        try {
          const claim = JSON.parse(buffer.slice(0, end))
          validatePreloadClaim317(claim)
          finished = true
          socket.end()
          server.close()
          resolveClaim(claim)
        } catch (error) {
          finished = true
          socket.destroy()
          server.close()
          rejectClaim(error)
        }
      })
      socket.on('error', error => {
        if (!finished) { finished = true; server.close(); rejectClaim(error) }
      })
    })
    server.on('error', error => {
      if (!finished) { finished = true; rejectClaim(error) }
    })
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
      server.listen(socketPath)
    })
    ownsSocket = true
    chmodSync(socketPath, 0o600)
    writeFileSync(pidPath, String(process.pid), { mode: 0o600, flag: 'w' })
    ownsPid = true
    // Import only environment-independent helpers before the claim. In
    // particular, auth/config modules must observe the claimed environment.
    await Promise.all([
      import('../utils/cliArgv317.ts'),
      import('../utils/cliStartupFailure.ts'),
    ])
    const claim = await claimPromise
    for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.off(signal, interrupted)
    process.off('uncaughtException', onUnhandled)
    cleanup()
    await onClaim(claim)
  } catch (error) {
    if (server?.listening) server.close()
    process.stderr.write('[preload] claim recv failed: ' + String(error) + '\n')
    process.exitCode = 1
  } finally {
    for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.off(signal, interrupted)
    process.off('uncaughtException', onUnhandled)
    cleanup()
  }
}
