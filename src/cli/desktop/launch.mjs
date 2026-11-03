import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const ALLOWED = new Set([
  '--desktop', '--continue', '-c', '--resume', '-r',
  '--debug', '-d', '--debug-to-stderr', '-d2e', '--debug-file', '--verbose',
])
const RESTRICTED = [
  ['CLAUDE_CODE_RESTRICTED', 'a restricted session: CLAUDE_CODE_RESTRICTED'],
  ['CLAUDE_CODE_RESTRICT_PERSONAL_CONFIG', 'a session that restricts your own Claude Code files: CLAUDE_CODE_RESTRICT_PERSONAL_CONFIG'],
  ['CLAUDE_CODE_SAFE_MODE', 'safe mode: CLAUDE_CODE_SAFE_MODE'],
  ['CLAUDE_CODE_SIMPLE', 'bare mode: CLAUDE_CODE_SIMPLE'],
]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function truthy(value) {
  return value !== undefined && value !== '' && value !== '0' && value !== 'false'
}

/**
 * Parse only the public Desktop fast-path's argument shape, before the REPL
 * initializer can register background timers or terminal input listeners.
 * The raw argv is still validated independently before any side effects.
 */
export function parseDesktopCliOptions(argv) {
  const options = {}
  let prompt
  const valueFlags = new Set([
    '--resume', '-r', '--debug-file', '--model', '--agent', '--sdk-url',
    '--settings', '--project-config-root', '--permission-mode',
  ])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      prompt = argv.slice(i + 1).join(' ')
      break
    }
    if (arg === '--continue' || arg === '-c') {
      options.continue = true
      continue
    }
    if (arg === '--resume' || arg === '-r') {
      const candidate = argv[i + 1]
      options.resume = candidate && !candidate.startsWith('-') ? argv[++i] : true
      continue
    }
    if (arg.startsWith('--resume=')) {
      options.resume = arg.slice('--resume='.length) || true
      continue
    }
    if (arg.startsWith('-')) {
      if (valueFlags.has(arg) && argv[i + 1] && !argv[i + 1].startsWith('-')) i++
      continue
    }
    prompt = prompt === undefined ? arg : `${prompt} ${arg}`
  }
  return { options, prompt }
}

/** Return a user-visible validation error, or null when Desktop launch is eligible. */
export function validateDesktopInvocation({
  argv = [], prompt, stdinIsTTY = false, stdoutIsTTY = false, env = {},
} = {}) {
  if (!stdoutIsTTY || argv.some(arg => ['--print', '-p', '--init-only'].includes(arg) ||
      arg === '--sdk-url' || arg.startsWith('--sdk-url='))) {
    return "--desktop opens the Claude Desktop app and can't run non-interactively (`--print`, `--sdk-url`, `--init-only`, or redirected output)."
  }
  const incompatible = argv.filter(arg => arg.startsWith('-') &&
    !ALLOWED.has(arg.split('=')[0])).map(arg => `\`${arg.split('=')[0]}\``)
  if (incompatible.length) {
    return `--desktop only opens the Claude Desktop app; it can't be combined with ${incompatible.join(', ')}.`
  }
  for (const [flag, detail] of RESTRICTED) {
    if (truthy(env[flag])) {
      return `--desktop can't open the Claude Desktop app from ${detail} wouldn't apply to the session the app starts.`
    }
  }
  if (prompt !== undefined && prompt !== '') {
    return "--desktop doesn't take a prompt yet. Run `claude --desktop`, then type it in the app."
  }
  if (!stdinIsTTY) {
    return "--desktop doesn't take piped or redirected input yet. Run `claude --desktop` on its own, then type in the app."
  }
  return null
}

async function existsInProjects(sessionId) {
  const { getProjectsDir, sessionIdExists } = await import('../../utils/sessionStorage.js')
  if (sessionIdExists(sessionId)) return true
  const root = getProjectsDir()
  let dirs
  try { dirs = await readdir(root, { withFileTypes: true }) }
  catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    try {
      const file = await stat(join(root, dir.name, `${sessionId}.jsonl`))
      if (file.isFile() && file.size > 0) return true
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return false
}

async function isRunningBackgroundSession(sessionId) {
  const { listSessions } = await import('../background/sessionStore.mjs')
  const sessions = await listSessions({ all: true })
  return sessions.some(session => session.sessionId === sessionId && session.running)
}

function reportError(message) {
  process.stderr.write(`${message}\n`)
  return 1
}

/** 2.1.310 Desktop CLI entry: new / continue / explicit session resume. */
export async function launchDesktopFromCli({
  prompt = '', options = {}, argv = process.argv.slice(2),
  stdinIsTTY = process.stdin.isTTY === true,
  stdoutIsTTY = process.stdout.isTTY === true,
  env = process.env, platform = process.platform, arch = process.arch,
} = {}) {
  const invalid = validateDesktopInvocation({ argv, prompt, stdinIsTTY, stdoutIsTTY, env })
  if (invalid) return reportError(invalid)
  if (platform !== 'darwin' && !(platform === 'win32' && arch === 'x64')) {
    return reportError("--desktop isn't available on this platform. It works on macOS and Windows (x64).")
  }
  const { isClaudeAISubscriber } = await import('../../utils/auth.js')
  if (!isClaudeAISubscriber()) {
    return reportError("--desktop requires signing in with a Claude account. Run `claude auth login` to sign in.")
  }
  let target
  if (options.continue) {
    const { fetchLogs, getSessionIdFromLog } = await import('../../utils/sessionStorage.js')
    const [latest] = await fetchLogs(1)
    const sessionId = latest && getSessionIdFromLog(latest)
    if (!sessionId) {
      return reportError('No session in this directory to continue. Run `claude --desktop` to start a new one in Claude Desktop.')
    }
    target = { kind: 'resume', sessionId }
  } else if (options.resume !== undefined && options.resume !== false) {
    if (options.resume === true) {
      return reportError('`--desktop --resume` needs a session ID. Pass one, or use `--desktop --continue` for the most recent session in this directory.')
    }
    const sessionId = options.resume
    if (typeof sessionId !== 'string' || !UUID.test(sessionId)) {
      return reportError('`--desktop --resume` takes a session ID, not a name or path. Run `claude --resume` to pick a session, then /desktop inside it.')
    }
    if (!(await existsInProjects(sessionId))) {
      return reportError(`No session found with ID ${sessionId}. Run \`claude --resume\` to pick a session, then /desktop inside it.`)
    }
    target = { kind: 'resume', sessionId }
  } else {
    target = { kind: 'new-session', folder: process.cwd() }
  }
  if (target.kind === 'resume' && await isRunningBackgroundSession(target.sessionId)) {
    return reportError(`Session ${target.sessionId} is open in another terminal. Run /desktop there instead.`)
  }
  const { openDesktopTarget } = await import('../../utils/desktopDeepLink.js')
  const result = await openDesktopTarget(target)
  if (!result.success) return reportError(result.error || 'Failed to open Claude Desktop')
  process.stdout.write(target.kind === 'resume'
    ? `Opening session ${target.sessionId} in Claude Desktop\n`
    : `Opening ${target.folder} in Claude Desktop\n`)
  return 0
}
