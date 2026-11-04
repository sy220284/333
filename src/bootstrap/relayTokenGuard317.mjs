/**
 * Official Claude Code 2.1.317 cli.js: protected remote MCP HTTP startup.
 *
 * When a runner passes a secret relay token file descriptor into a remote
 * tunnel, Linux must disable process dumpability before any normal CLI
 * initialization. Otherwise another same-user process may read the descriptor
 * from /proc/<pid>/fd or inspect the process memory.
 */
const SAFE_MCP_OPTIONS = /^(?:--port(?:=\d+)?|\d+|--result-format(?:=(?:raw|rendered))?|raw|rendered|--session-tunnel|--debug|-d|--verbose)$/
const PR_SET_DUMPABLE = 4

function envTrue(value) {
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

export function shouldProtectRelayToken317(argv = process.argv, env = process.env) {
  if (env.CCR_AGENT_PROXY_TOKEN_FILE_DESCRIPTOR === undefined &&
      !argv.includes('--session-tunnel')) return false
  if (!envTrue(env.CLAUDE_CODE_REMOTE) ||
      String(env.CLAUDE_CODE_ENVIRONMENT_KIND ?? '').trim() !== '') return false
  if (argv[2] !== 'mcp' || argv[3] !== 'serve') return false
  let options
  if (argv[4] === '--transport=http') options = argv.slice(5)
  else if (argv[4] === '--transport' && argv[5] === 'http') options = argv.slice(6)
  else return false
  return options.every(option => SAFE_MCP_OPTIONS.test(option))
}

/**
 * A self-hosted code-review runner carries credentials before its normal
 * session initialization. This is the separate 2.1.317 cli.js review guard.
 */
export function shouldProtectRunnerReviewTokens317(env = process.env) {
  return env.CLAUDE_CODE_REMOTE_SESSION_ORIGIN === 'review' &&
    env.CLAUDE_CODE_ENVIRONMENT_KIND === 'byoc' &&
    env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE === 'self_hosted'
}

/** Install the kernel protection once the exact upstream startup gate fires. */
async function setProcessNonDumpable317({
  platform = process.platform,
  bun = typeof Bun === 'undefined' ? undefined : Bun,
  ffiLoader = () => import('bun:ffi'),
} = {}) {
  if (platform !== 'linux') return false

  if (typeof bun?.ant?.setDumpable === 'function') {
    if (!bun.ant.setDumpable(false))
      throw new Error('Cannot disable Linux process dumpability for remote runner')
    return true
  }

  const { dlopen, FFIType } = await ffiLoader()
  const libc = dlopen('libc.so.6', {
    prctl: { args: Array(5).fill(FFIType.i32), returns: FFIType.i32 },
  })
  try {
    const status = libc.symbols.prctl(PR_SET_DUMPABLE, 0, 0, 0, 0)
    if (status !== 0)
      throw new Error('prctl(PR_SET_DUMPABLE, 0) failed: ' + status)
  } finally {
    libc.close()
  }
  return true
}

/** Protect the original remote MCP HTTP relay-token entrypoint. */
export async function guardRelayTokenDescriptor317({
  argv = process.argv, env = process.env, ...runtime
} = {}) {
  if (!shouldProtectRelayToken317(argv, env)) return false
  return setProcessNonDumpable317(runtime)
}

/** Protect the separate BYOC self-hosted code-review runner entrypoint. */
export async function guardRunnerReviewTokens317({
  env = process.env, ...runtime
} = {}) {
  if (!shouldProtectRunnerReviewTokens317(env)) return false
  return setProcessNonDumpable317(runtime)
}
