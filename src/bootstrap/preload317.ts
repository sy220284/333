import { createServer } from 'node:net'
import { mkdirSync, lstatSync, unlinkSync, writeFileSync, chmodSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * 2.1.317 Linux-x64 cli.js --preload and chunk-dzajqkwk.js:
 * A warm process claims a single newline-framed session over an AF_UNIX
 * socket, restores the session environment/argv/cwd, then enters the CLI.
 * This entrypoint is intentionally independent from the ordinary REPL init.
 */
export const DEFAULT_PRELOAD_SOCKET_317 = '/home/claude/.claude/remote/spare.sock'
const MAX_CLAIM_BYTES = 8 * 1024 * 1024
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const TRANSIENT_STARTUP_ENV = [
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
  'CLAUDE_CODE_WORKER_EPOCH', 'CLAUDE_CODE_CCR_WORKER_SOCKET',
  'CLAUDE_CODE_CCR_OWN_CONNECTION_POOL', 'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ORIGIN', 'CLAUDE_CODE_REMOTE_SESSION_ID',
  'CLAUDE_CODE_REMOTE_SDK_URL', 'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_OWNER_ACCOUNT_UUID', 'CLAUDE_CODE_BRIDGE_OWNER_ORG_UUID',
  'CLAUDE_CODE_BRIDGE_SOURCE_DIR', 'CLAUDE_CODE_JIT_POLICY_AFTER_STARTUP',
  'CLAUDE_CODE_DIAGNOSTICS_FILE', 'CLAUDE_SESSION_INGRESS_TOKEN_FILE',
  'CLAUDE_CODE_WORKFLOW_LAUNCH_SHA256', 'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDECODE', 'CLAUDE_RUNNER_ACTIVITY_FD', 'CLAUDE_RUNNER_UPDATE_BIN',
  'SESSION_INGRESS_URL', 'CCR_SESSION_PROFILE'
]

function unlinkIfPresent(path) {
  try { unlinkSync(path) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}

function verifySocketPath(socketPath) {
  const existing = (() => {
    try { return lstatSync(socketPath) }
    catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
  })()
  if (existing) {
    if (!existing.isSocket())
      throw new Error('Preload socket path exists and is not a Unix socket: ' + socketPath)
    unlinkIfPresent(socketPath)
  }
}

export function validatePreloadClaim317(claim) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim))
    throw new Error('Preload claim must be an object')
  if (typeof claim.cwd !== 'string' || !claim.cwd)
    throw new Error('Preload claim requires cwd')
  if (!Array.isArray(claim.argv) || !claim.argv.every(value => typeof value === 'string'))
    throw new Error('Preload claim requires argv strings')
  if (!claim.env || typeof claim.env !== 'object' || Array.isArray(claim.env))
    throw new Error('Preload claim requires env object')
  const changes = []
  for (const [name, value] of Object.entries(claim.env)) {
    if (!ENV_KEY.test(name)) throw new Error('Invalid preload environment variable name')
    if (typeof value !== 'string' || value.includes('\0'))
      throw new Error('Invalid preload environment value for ' + name)
    changes.push([name, value])
  }
  return { cwd: realpathSync(claim.cwd), argv: claim.argv, env: changes }
}

export function applyPreloadClaim317(claim, {
  env = process.env, argv = process.argv, chdir = process.chdir.bind(process),
} = {}) {
  const normalized = validatePreloadClaim317(claim)
  chdir(normalized.cwd)
  for (const name of TRANSIENT_STARTUP_ENV) delete env[name]
  // The official claim replaces token values with those provided by the
  // session; credentials inherited from a different warmed session must go.
  for (const name of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'])
    delete env[name]
  for (const [name, value] of normalized.env) env[name] = value
  argv.splice(2, argv.length - 2, ...normalized.argv)
  return normalized
}

export async function runPreload317(args = process.argv.slice(2), {
  onClaim = async claim => {
    applyPreloadClaim317(claim)
    const { setOriginalCwd } = await import('./state.js')
    setOriginalCwd(process.cwd())
    const { main } = await import('../main.js')
    await main()
  },
} = {}) {
  const socketPath = args[0] || DEFAULT_PRELOAD_SOCKET_317
  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 })
  verifySocketPath(socketPath)
  const pidPath = socketPath + '.pid'
  let server
  let finished = false
  let resolveClaim
  let rejectClaim
  const claimPromise = new Promise((resolve, reject) => {
    resolveClaim = resolve; rejectClaim = reject
  })
  const cleanup = () => {
    for (const path of [socketPath, pidPath]) unlinkIfPresent(path)
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
    chmodSync(socketPath, 0o600)
    writeFileSync(pidPath, String(process.pid), { mode: 0o600, flag: 'w' })
    // Import only environment-independent helpers before the claim. In
    // particular, auth/config modules must observe the claimed environment.
    await Promise.all([
      import('../utils/cliArgv317.mjs'),
      import('../utils/cliStartupFailure.mjs'),
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
