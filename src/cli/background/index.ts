import { backgroundSessionVerbIndex317, hasCliFlag } from '../../utils/cliArgv317.mjs'
import { connect } from 'node:net'
import { spawn } from 'node:child_process'
import { open, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline/promises'
import {
  fleetHome, fleetSocket, listSessions, matchSession,
  readTail, stripUnsafeTerminal, MAX_LOG_BYTES, isAlive
} from './sessionStore.mjs'
import { runBackgroundSupervisor } from './supervisor.mjs'

const DAEMON_HELP = [
  'Usage: claude daemon [subcommand] [options]', '',
  'Service lifecycle:',
  '  run [json-path]   Run the supervisor in the foreground (default when piped)',
  '  status            Show daemon pid, version, uptime',
  '  logs              Tail the daemon log (Ctrl-C to stop)',
  '  uninstall         Remove the background service (launchctl/systemd)',
  '  stop              Shut down the supervisor and terminate background sessions',
  '                      --any           also stop a transient (non-service) daemon',
  '                      --keep-workers  leave detached sessions running', '',
  '  Service install is disabled in this version — the daemon runs on demand',
  '  and exits when the last client disconnects.', '',
  'Options:',
  '  --help, -h        Show this help',
].join('\n')
const DESCRIPTION = {
  agents: 'Manage background agents',
  attach: 'Open the background session in this terminal. ← returns to agent view, Ctrl+Z drops back to your shell. The session keeps running either way.',
  logs: "Print the background session's recent terminal output.",
  stop: 'Stop a background session. Its conversation is kept; resume it later with claude attach.',
  respawn: 'Restart a background session (or all of them) so it picks up the current Claude binary.',
  rm: 'Delete a background session and its worktree. Unlike stop, works on already-exited sessions.',
}
const HELP = {
  agents: ['Usage: claude agents [options]', '', DESCRIPTION.agents, '', 'Options:',
    '  --add-dir <directory>          Include an additional allowed directory (repeatable)',
    '  --agent <agent>                Default agent for dispatched sessions',
    '  --all                          Include completed sessions in JSON output',
    '  --allow-dangerously-skip-permissions  Make bypass mode available to dispatched sessions',
    '  --cwd <path>                   Filter sessions by working directory',
    '  --dangerously-skip-permissions  Alias for --permission-mode bypassPermissions',
    '  --effort <level>               Default effort for dispatched sessions',
    '  --json                         Print active sessions as a JSON array and exit',
    '  --mcp-config <config>          MCP server config for dispatched sessions (repeatable)',
    '  --model <model>                Default model when dispatching sessions',
    '  --permission-mode <mode>       Default permission mode',
    '  --plugin-dir <path>            Plugin directories for dispatched sessions (repeatable)',
    '  --restricted                  Dispatch in restricted mode',
    '  --setting-sources <sources>    Comma-separated user, project, local settings',
    '  --settings <file-or-json>      Apply settings to dispatched sessions',
    '  --strict-mcp-config           Only use the supplied MCP server configuration',
    '  -h, --help                     Display help for command'].join('\n'),
  attach: `Usage: claude attach <id|name>\n\n  ${DESCRIPTION.attach}`, 
  logs: `Usage: claude logs <id|name>\n\n  ${DESCRIPTION.logs} Part of the session name works in place of the id.`, 
  stop: `Usage: claude stop <id>\n\n  ${DESCRIPTION.stop}`, 
  respawn: `Usage: claude respawn <id>|--all\n\n  ${DESCRIPTION.respawn}`, 
  rm: [
    'Usage: claude rm <id> [--discard-unpushed <commit>@<worktree-id>] [--force-remove-worktree <worktree-id>]', '',
    `  ${DESCRIPTION.rm}`, 
    '  --discard-unpushed <commit>@<worktree-id>  also discard worktree unpushed commits and uncommitted changes,',
    '    only when the previously reported HEAD and worktree digest still match',
    '  --force-remove-worktree <worktree-id>  remove a worktree that was not removed cleanly,',
    '    only with its previously reported confirmation digest.',
  ].join('\n'),
}
const COMMANDS = new Set(['agents', 'attach', 'logs', 'stop', 'kill', 'respawn', 'rm', 'daemon'])
const VALUE_FLAGS = new Set([
  '--agent', '--model', '--cwd', '--settings', '--setting-sources', '--mcp-config',
  '--plugin-dir', '--permission-mode', '--effort', '--session-id', '--resume',
  '--system-prompt', '--append-system-prompt', '--output-format', '--name',
  '--add-dir', '--allowedTools', '--allowed-tools', '--disallowedTools',
  '--disallowed-tools', '--tools', '--agents', '--plugin-url', '--debug-file',
  '--file', '--project-config-root', '--system-prompt-file',
  '--append-system-prompt-file', '--resume-session-at',
])
function rootArg(argv, key) {
  const i = argv.indexOf(key)
  return i !== -1 ? argv[i + 1] : undefined
}
function selfCommand() {
  return /(?:^|[\\/])bun(?:\.exe)?$/i.test(process.execPath)
    ? [process.execPath, process.argv[1]]
    : [process.execPath]
}
function socketConnect(timeout = 3500) {
  return new Promise((resolve, reject) => {
    const socket = connect(fleetSocket())
    const timer = setTimeout(() => socket.destroy(new Error('Background daemon connection timed out')), timeout)
    socket.once('connect', () => { clearTimeout(timer); resolve(socket) })
    socket.once('error', error => { clearTimeout(timer); reject(error) })
  })
}
function protocol(socket, listener) {
  let buffer = ''
  let sequence = 0
  const waiting = new Map()
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8')
    if (buffer.length > 8 * 1024 * 1024) {
      socket.destroy(new Error('Background service response exceeded protocol limit'))
      return
    }
    let end
    end = buffer.indexOf('\n')
    while (end >= 0) {
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      end = buffer.indexOf('\n')
      let event
      try { event = JSON.parse(line) }
      catch (error) { socket.destroy(new Error(`Invalid background service response: ${error.message}`)); return }
      if (event.event) { listener?.(event); continue }
      const entry = waiting.get(event.id)
      if (!entry) continue
      waiting.delete(event.id)
      if (event.ok) entry.resolve(event.data)
      else entry.reject(new Error(event.error))
    }
  })
  socket.on('close', () => {
    for (const w of waiting.values()) w.reject(new Error('Background service disconnected'))
    waiting.clear()
  })
  const ask = payload => new Promise((resolve, reject) => {
    const id = ++sequence
    waiting.set(id, { resolve, reject })
    socket.write(`${JSON.stringify({ ...payload, requestId: id })}\n`, error => {
      if (error) { waiting.delete(id); reject(error) }
    })
  })
  return { ask }
}
async function ask(request, { start = false } = {}) {
  let socket
  try { socket = await socketConnect() }
  catch (error) {
    if (!start || !['ENOENT', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) throw error
    await startDaemon()
    socket = await socketConnect()
  }
  try { return await protocol(socket).ask(request) }
  finally { socket.end() }
}
async function startDaemon() {
  await mkdir(fleetHome(), { recursive: true, mode: 0o700 })
  const out = await open(join(fleetHome(), 'daemon.log'), 'a', 0o600)
  try {
    const cmd = [...selfCommand(), '--internal-bg-supervisor']
    process.stderr.write('Starting background service…\n')
    const child = spawn(cmd[0], cmd.slice(1), {
      // Never hold the user's workspace/config folder as the supervisor CWD.
      // Windows prevents its deletion while the detached process is alive.
      detached: true, stdio: ['ignore', out.fd, out.fd], cwd: tmpdir(),
      env: { ...process.env, CLAUDE_CODE_SESSION_KIND: 'daemon' },
      windowsHide: true,
    })
    child.once('error', error => process.stderr.write(`Cannot start background daemon: ${error.message}\n`))
    child.unref()
  } finally { await out.close() }
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 150))
    try { const s = await socketConnect(150); s.destroy(); return }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) throw error }
  }
  throw new Error(`Background service failed to start. Inspect ${join(fleetHome(), 'daemon.log')}`)
}
function toPublic(j) {
  // Native 2.1.310 public JSON contract: no internal state, paths or env.
  return {
    ...(j.respawnCount > 0 && j.pid ? { pid: j.pid } : {}),
    id: j.id, cwd: j.cwd, kind: 'background', startedAt: j.startedAt,
    sessionId: j.sessionId, name: j.name || j.id, state: j.state,
  }
}
function inferredName(args) {
  const positional = []
  let waiting = false
  for (const arg of args) {
    if (waiting) { waiting = false; continue }
    if (VALUE_FLAGS.has(arg)) { waiting = true; continue }
    if (arg === '--') { continue }
    if (arg.startsWith('-')) continue
    positional.push(arg)
  }
  return positional.join(' ').trim().slice(0, 200) || undefined
}
async function list(args) {
  const all = args.includes('--all')
  const cwd = rootArg(args, '--cwd')
  const sessions = await listSessions({ all, cwd })
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(sessions.map(toPublic), null, 2)}\n`)
    return
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(`${sessions.map(x => `${x.id} ${x.name || ''} ${x.state} ${x.cwd}`).join('\n')}${sessions.length ? '\n' : ''}`)
    return
  }
  const lines = sessions.map((j, index) => `${String(index + 1).padStart(2)}. ${j.id}  ${j.name || j.cwd} [${j.state}]`)
  process.stdout.write(`Background agents\n${lines.length ? lines.join('\n') : 'No sessions'}\n`)
  const ui = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const response = (await ui.question('Select number to attach (blank to exit): ')).trim()
    if (!response) return
    const index = Number(response) - 1
    if (!Number.isInteger(index) || index < 0 || index >= sessions.length) throw new Error('Invalid agent selection')
    await attach(sessions[index].id)
  } finally { ui.close() }
}
async function attach(id) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('claude attach requires an interactive terminal')
  let socket
  try { socket = await socketConnect() }
  catch (error) {
    if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error
    await startDaemon()
    socket = await socketConnect()
  }
  const previousRaw = process.stdin.isRaw
  const send = payload => {
    if (!socket.destroyed) socket.write(`${JSON.stringify(payload)}\n`)
  }
  try {
    const channel = protocol(socket, event => {
      if (event.event === 'output') process.stdout.write(Buffer.from(event.data, 'base64'))
      if (event.event === 'exit') {
        socket.end()
      }
      if (event.event === 'error') process.stderr.write(`${event.message}\n`)
    })
    await channel.ask({ op: 'attach', id })
    process.stdin.setRawMode(true)
    process.stdin.resume()
    const onData = data => {
      const bytes = Buffer.from(data)
      if (bytes.includes(0x1a)) { void channel.ask({ op: 'detach' }).finally(() => socket.end()); return }
      void channel.ask({ op: 'input', data: bytes.toString('base64') }).catch(error => { process.stderr.write(`${error.message}\n`); socket.end() })
    }
    const onResize = () => send({ op: 'resize', cols: process.stdout.columns, rows: process.stdout.rows, requestId: 0 })
    process.stdin.on('data', onData)
    process.stdout.on('resize', onResize)
    onResize()
    await new Promise((resolve, reject) => {
      socket.once('close', resolve)
      socket.once('error', reject)
    })
    process.stdin.off('data', onData)
    process.stdout.off('resize', onResize)
  } finally {
    if (process.stdin.isTTY) process.stdin.setRawMode(!!previousRaw)
    process.stdin.pause()
    socket.destroy()
  }
}
async function daemon(args) {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${DAEMON_HELP}\n`)
    return
  }
  const action = args[0]
  if (action === 'run') { await runBackgroundSupervisor(); return }
  if (action === 'status') {
    try {
      const status = await ask({ op: 'ping' })
      process.stdout.write(`running (pid ${status.pid})\n  bg workers: ${status.running}\n`)
    } catch (error) {
      if (!['ENOENT', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) throw error
      process.stdout.write(`not running\n\nbg sessions:\n  control.sock: unreachable (${fleetSocket()})\n`)
      process.exitCode = 1
    }
    return
  }
  if (action === 'stop') {
    let owner
    try {
      owner = await ask({ op: 'ping' })
    } catch (error) {
      // Match the native 2.1.310 idempotent stop on an absent daemon.
      if (!['ENOENT', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) throw error
      process.stdout.write('no daemon running\n')
      return
    }
    await ask({ op: 'shutdown', keepWorkers: args.includes('--keep-workers') })
    // The control reply acknowledges shutdown before the OS process exits.
    const deadline = Date.now() + 5000
    while (isAlive(owner.pid) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (isAlive(owner.pid)) throw new Error(`Background service pid ${owner.pid} is still running after shutdown`)
    process.stdout.write('stopped\nnote: the next `claude agents` or `claude --bg` will start a new one\n')
    return
  }
  if (action === 'uninstall') {
    process.stdout.write('Service install is disabled in this version; the daemon runs on demand.\n')
    return
  }
  if (action === 'logs') {
    const file = join(fleetHome(), 'daemon.log')
    const tail = await readTail(file, MAX_LOG_BYTES).catch(error => {
      if (error.code === 'ENOENT') return ''
      throw error
    })
    process.stdout.write(tail)
    return
  }
  throw new Error(`Unknown daemon subcommand: ${action}`)
}
function rmOptions(args) {
  const out = {}
  for (let i = 1; i < args.length; i++) {
    const [flag, inline] = args[i].split('=', 2)
    if (flag === '--discard-unpushed') {
      const value = inline || args[++i]
      const match = /^([a-f0-9]{40,64})@([a-f0-9]{12})$/i.exec(value || '')
      if (!match) throw new Error("option '--discard-unpushed' requires <commit>@<worktree-id> previously reported by claude rm")
      out.discardUnpushed = { headSha: match[1], worktreeDigest: match[2] }
    } else if (flag === '--force-remove-worktree') {
      const value = inline || args[++i]
      if (!/^[a-f0-9]{12}$/i.test(value || '')) throw new Error("option '--force-remove-worktree' requires <worktree-id>")
      out.forceRemoveWorktree = value
    } else throw new Error(`Unknown rm option: ${flag}`)
  }
  return out
}
async function authForBackground(args) {
  const { enableConfigs, checkHasTrustDialogAccepted, getGlobalConfig } = await import('../../utils/config.js')
  enableConfigs()
  if (!checkHasTrustDialogAccepted()) throw new Error('Workspace not trusted. Run claude here and accept the trust prompt before using --bg.')
  if ((args.includes('--dangerously-skip-permissions') || rootArg(args, '--permission-mode') === 'bypassPermissions') && !getGlobalConfig().bypassPermissionsModeAccepted)
    throw new Error('--bg with bypassPermissions requires accepting the disclaimer first. Run claude --dangerously-skip-permissions once interactively.')
}
function argValue(args, flag) {
  const index = args.findIndex(a => a === flag || a.startsWith(`${flag}=`))
  return index === -1 ? undefined : args[index].includes('=') ? args[index].slice(flag.length + 1) : args[index + 1]
}
export function activeBackgroundFlags(args) {
  const found = new Set()
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--') break
    if (VALUE_FLAGS.has(arg)) { found.add(arg); index++; continue }
    if (arg.startsWith('--') && arg.includes('=') &&
        VALUE_FLAGS.has(arg.slice(0, arg.indexOf('=')))) {
      found.add(arg.slice(0, arg.indexOf('=')))
      continue
    }
    if (arg.startsWith('-')) found.add(arg)
  }
  return found
}

export function validateBackgroundCliArgs(args) {
  const flags = activeBackgroundFlags(args)
  if (flags.has('--print') || flags.has('-p') ||
      [...flags].some(flag => flag.startsWith('--print=') || /^-[^-]*p/.test(flag))) {
    return "--bg and --print conflict: --print never starts the interactive session that `claude agents` attaches to, so the job would be unattachable. The prompt is the positional — drop --print: `claude --bg '<task>'`."
  }
  if ([...flags].some(flag => flag === '--project-config-root' || flag.startsWith('--project-config-root='))) {
    return 'Background sessions are unavailable with --project-config-root. Run the task in a foreground session instead.'
  }
  const agents = argValue(args, '--agents')
  if (agents !== undefined) {
    let parsed
    try { parsed = JSON.parse(agents) }
    catch { return "--bg can't read --agents from a file: a background session is interactive, and the file form works only with --print. Pass the agents as inline JSON." }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '--bg requires --agents to be an inline JSON object.'
    }
  }
  return null
}

export async function interceptBackgroundCli(args) {
  if (args[0] === '--internal-bg-supervisor') {
    await runBackgroundSupervisor()
    return true
  }
  const sessionVerbIndex = backgroundSessionVerbIndex317(args)
  const at = sessionVerbIndex !== -1 ? sessionVerbIndex : (COMMANDS.has(args[0]) ? 0 : -1)
  const verb = at === -1 ? null : args[at]
  const flags = activeBackgroundFlags(args)
  const bg = hasCliFlag('--bg', args) || hasCliFlag('--background', args)
  if (!verb && !bg) return false
  if (verb === 'daemon') { await daemon(args.slice(at + 1)); return true }
  if (verb === 'agents') {
    const options = args.slice(at + 1)
    if (options.includes('--help') || options.includes('-h')) process.stdout.write(`${HELP.agents}\n`)
    else await list(options)
    return true
  }
  if (bg) {
    if (flags.has('--desktop')) throw new Error('--desktop cannot be combined with --bg')
    const invalid = validateBackgroundCliArgs(args)
    if (invalid) throw new Error(invalid)
    await authForBackground(args)
    const explicitName = argValue(args, '--name')
    const response = await ask({
      op: 'dispatch', cwd: process.cwd(), args, cols: process.stdout.columns || 100,
      rows: process.stdout.rows || 30, name: explicitName || inferredName(args),
      nameSource: explicitName ? 'flag' : 'prompt',
      agent: argValue(args, '--agent'), model: argValue(args, '--model'),
    }, { start: true })
    process.stdout.write([
      `backgrounded · ${response.id}`,
      '  claude agents             list sessions',
      `  claude attach ${response.id}    open in this terminal`,
      `  claude logs ${response.id}      show recent output`,
      `  claude stop ${response.id}      stop this session`,
    ].concat('').join('\n'))
    return true
  }
  const normalized = verb === 'kill' ? 'stop' : verb
  const options = args.slice(at + 1)
  if (options.includes('--help') || options.includes('-h')) {
    process.stdout.write(`${HELP[normalized]}\n`)
    return true
  }
  if (normalized === 'respawn' && options[0] === '--all') {
    const sessions = await listSessions({ all: true })
    for (const session of sessions) {
      if (['completed', 'failed', 'stopped'].includes(session.state)) {
        await ask({ op: 'respawn', id: session.id }, { start: true })
        process.stdout.write(`respawned ${session.id}\n`)
      }
    }
    return true
  }
  const id = options[0]
  if (!id) throw new Error(`Usage: claude ${normalized} <id>`)
  // Resolve against persisted records before starting a daemon; the official
  // x64 reports a missing id without booting a service or masking ENOJOB.
  const matches = await listSessions({ all: true })
  const selected = matchSession(matches, id, {
    usage: `${normalized} <id>`,
    name: normalized === 'attach' || normalized === 'logs',
  })
  if (normalized === 'attach') { await attach(selected.id); return true }
  if (normalized === 'logs') {
    const job = matchSession(await listSessions({ all: true }), id, { usage: 'logs <id|name>' })
    try { process.stdout.write(stripUnsafeTerminal(await readTail(job.logPath))) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    return true
  }
  if (normalized === 'stop') {
    const result = await ask({ op: 'stop', id: selected.id }, { start: true })
    process.stdout.write(`stopped ${result.id}\n`)
    if (result.worktreePath) process.stdout.write(`  worktree retained at ${result.worktreePath}\n`)
    return true
  }
  if (normalized === 'respawn') {
    const result = await ask({ op: 'respawn', id: selected.id }, { start: true })
    process.stdout.write(`respawned ${result.id}\n`)
    return true
  }
  if (normalized === 'rm') {
    const result = await ask({ op: 'rm', id: selected.id, ...rmOptions(options) }, { start: true })
    process.stdout.write(`removed ${result.id}\n`)
    return true
  }
  return false
}
