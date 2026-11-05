import { createServer } from 'node:net'
import { resumeFlags } from './respawnFlags317.ts'
import { chmod, appendFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertSocketVacant317, captureSocketIdentity317, unlinkOwnedSocket317 } from '../../bootstrap/socketOwnership317.ts'
import {
  prepareFleet, fleetSocket, listSessions, createSessionRecord, reserveNewSession, saveSession,
  editSession, deleteSession, matchSession, readSession, readTail,
  removeWorktreeSafely, isAlive, assertNoUnmanagedLiveWorker
} from './sessionStore.ts'

const active = new Map()
const outputQueue = new Map()
const serverClients = new Set()
let server
let idleTimer

function send(socket, payload) {
  if (!socket.destroyed) socket.write(`${JSON.stringify(payload)}\n`)
}
function recordOutput(id, bytes) {
  const job = active.get(id)
  if (!job) return
  const chunk = Buffer.from(bytes)
  const previous = outputQueue.get(id) || Promise.resolve()
  const next = previous.then(() => appendFile(job.record.logPath, chunk))
  outputQueue.set(id, next)
  next.catch(error => {
    for (const peer of job.subscribers) send(peer, { event: 'error', message: `Failed to persist terminal output: ${error.message}` })
  })
  for (const peer of job.subscribers) send(peer, { event: 'output', data: chunk.toString('base64') })
}
function childExecutable() {
  const isBunCommand = /(?:^|[\\/])bun(?:\.exe)?$/i.test(process.execPath)
  return isBunCommand ? [process.execPath, process.argv[1]] : [process.execPath]
}
function sanitizedArgs(args) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--bg' || arg === '--background') continue
    if (arg === '--session-id') { i++; continue }
    if (arg.startsWith('--session-id=')) continue
    out.push(arg)
  }
  return out
}
export { resumeFlags } from './respawnFlags317.ts'
async function launch(record, { resume = false } = {}) {
  if (!globalThis.Bun?.spawn) throw new Error('Background interactive sessions require Bun 1.4.4 with PTY support')
  if (active.has(record.id)) throw new Error(`Session is already running: ${record.id}`)
  const [binary, ...prefix] = childExecutable()
  const args = resume
    ? [...resumeFlags(record.argv), '--resume', record.sessionId]
    : [...sanitizedArgs(record.argv), '--session-id', record.sessionId]
  const spawnArgs = [binary, ...prefix, ...args]
  const cols = Number.isInteger(record.cols) && record.cols >= 20 ? record.cols : 100
  const rows = Number.isInteger(record.rows) && record.rows >= 5 ? record.rows : 30
  const subscribers = new Set()
  const earlyOutput = []
  // A child can exit before its initial session record has been committed.
  // Serialize the exit transition behind that commit to avoid resurrecting a
  // completed job as 'working' when launch() finishes.
  let settleLaunch
  const launchCommitted = new Promise(resolve => { settleLaunch = resolve })
  let settleFinalization
  const finalization = new Promise(resolve => { settleFinalization = resolve })
  const proc = Bun.spawn(spawnArgs, {
    cwd: record.cwd,
    env: {
      ...process.env, CLAUDE_CODE_SESSION_KIND: 'bg',
      CLAUDE_CODE_SESSION_NAME: record.name || '',
      CLAUDE_CODE_SESSION_LOG: record.logPath,
      CLAUDE_CODE_BACKGROUND_SESSION_ID: record.id,
    },
    terminal: {
      cols, rows,
      data(_terminal, data) {
        if (active.has(record.id)) recordOutput(record.id, data)
        else earlyOutput.push(Buffer.from(data))
      },
    },
    onExit(_proc, exitCode, signalCode) {
      void (async () => {
        let failure
        try {
          const committed = await launchCommitted
          if (!committed) return
          // Terminal persistence can fail (disk full, read-only log, etc.).
          // The exited worker must still be reaped and the failure recorded.
          let outputError
          try { await outputQueue.get(record.id) }
          catch (error) { outputError = error }
          const snapshot = await readSession(record.id)
          const stoppedByUser = snapshot?.state === 'stopping' || snapshot?.state === 'stopped'
          const state = outputError ? 'failed' :
            stoppedByUser ? 'stopped' : exitCode === 0 ? 'completed' : 'failed'
          await editSession(record.id, {
            state, exitCode, signalCode, pid: null,
            detail: outputError ? 'terminal output could not be persisted: ' +
              String(outputError) : stoppedByUser ? 'stopped' : 'process exited',
          })
          if (outputError) failure = outputError
        } catch (error) {
          failure = error
        } finally {
          const current = active.get(record.id)
          // A previous worker may settle after the replacement was assigned.
          // Only the worker that emitted this exit may clear its own slot.
          const owned = current?.proc === _proc
          if (owned) {
            active.delete(record.id)
            outputQueue.delete(record.id)
          }
          settleFinalization()
          if (owned && current) {
            if (failure) for (const peer of current.subscribers)
              send(peer, { event: 'error', message: 'Session exit recording failed: ' + String(failure) })
            for (const peer of current.subscribers) send(peer, { event: 'exit', exitCode, signalCode })
            try { current.proc.terminal?.close() }
            catch (error) {
              process.stderr.write('Terminal close failed: ' + String(error) + '\\n')
            }
          }
          if (failure) process.stderr.write('Session exit recording failed: ' + String(failure) + '\\n')
        }
      })().catch(error => process.stderr.write('Background exit finalization failed: ' + String(error) + '\\n'))
    },
  })
  const next = {
    ...record,
    name: resume && record.nameSource === 'prompt' ? record.id : record.name,
    pid: proc.pid, state: 'working', detail: '',
    respawnCount: (record.respawnCount || 0) + (resume ? 1 : 0),
    startedAt: resume ? Date.now() : record.startedAt,
    updatedAt: new Date().toISOString(),
  }
  active.set(record.id, { proc, record: next, subscribers, finalization })
  try {
    await saveSession(next)
    settleLaunch(true)
    for (const chunk of earlyOutput) recordOutput(record.id, chunk)
    return next
  } catch (error) {
    settleLaunch(false)
    // A child must never run untracked after its durable session record
    // failed to commit. Terminate it before allowing another dispatch.
    try { proc.kill('SIGTERM') }
    catch (killError) {
      process.stderr.write('Could not terminate untracked session: ' + String(killError) + '\\n')
    }
    const awaitExitWithin = async (ms) => {
      let timer
      try {
        await Promise.race([
          proc.exited,
          new Promise(resolve => { timer = setTimeout(resolve, ms) }),
        ])
      } finally { if (timer) clearTimeout(timer) }
    }
    await awaitExitWithin(5_000)
    if (isAlive(proc.pid)) {
      try { proc.kill('SIGKILL') }
      catch (killError) {
        process.stderr.write('Could not force-kill untracked session: ' + String(killError) + '\\n')
      }
      await awaitExitWithin(1_000)
    }
    active.delete(record.id)
    outputQueue.delete(record.id)
    throw error
  }
}
async function stop(id) {
  const job = active.get(id)
  if (!job) {
    const record = await readSession(id)
    if (record && isAlive(record.pid)) throw new Error('Session belongs to a different supervisor; use its daemon to stop it')
    if (record) await editSession(id, { state: 'stopped', detail: 'stopped', pid: null })
    return
  }
  await editSession(id, { state: 'stopping', detail: 'stop requested' })
  try { job.proc.kill('SIGINT') }
  catch (error) { throw new Error(`Could not interrupt session ${id}: ${error.message}`) }
  const settled = await Promise.race([job.proc.exited.then(() => true), new Promise(r => setTimeout(() => r(false), 4500))])
  if (!settled && active.has(id)) {
    job.proc.kill('SIGTERM')
    await Promise.race([job.proc.exited, new Promise(r => setTimeout(r, 750))])
  }
  if (active.has(id) && isAlive(job.proc.pid)) throw new Error(`Could not confirm session termination: ${id}`)
  await editSession(id, { state: 'stopped', detail: 'stopped', pid: null })
}
async function dispatch(request) {
  if (!Array.isArray(request.args) || !request.args.every(a => typeof a === 'string')) throw new Error('Invalid dispatch arguments')
  if (!request.cwd || typeof request.cwd !== 'string') throw new Error('Invalid background working directory')
  let saved
  for (let attempt = 0; attempt < 8; attempt++) {
    const record = createSessionRecord({
      argv: sanitizedArgs(request.args), cwd: resolve(request.cwd),
      name: request.name, agent: request.agent, model: request.model,
    })
    record.cols = request.cols
    record.rows = request.rows
    record.nameSource = request.nameSource || 'prompt'
    try {
      saved = await reserveNewSession(record)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
  if (!saved) throw new Error('Failed to allocate a unique background session ID after 8 attempts')
  try { return await launch(saved) }
  catch (error) {
    await editSession(saved.id, { state: 'failed', detail: error.message, pid: null })
    throw error
  }
}
async function command(request, socket) {
  switch (request.op) {
    case 'ping':
      return { version: '2.1.317', pid: process.pid, running: active.size }
    case 'list':
      return listSessions({ all: !!request.all, cwd: request.cwd })
    case 'dispatch': {
      const job = await dispatch(request)
      return { id: job.id, sessionId: job.sessionId, name: job.name }
    }
    case 'logs': {
      const found = matchSession(await listSessions({ all: true }), request.id, { usage: 'logs <id|name>' })
      return { id: found.id, text: await readTail(found.logPath).catch(error => {
        if (error.code === 'ENOENT') return ''
        throw error
      }) }
    }
    case 'stop': {
      const found = matchSession(await listSessions({ all: true }), request.id, { usage: 'stop <id>', name: false })
      await stop(found.id)
      return { id: found.id, stopped: true, worktreePath: found.worktreePath }
    }
    case 'respawn': {
      const target = matchSession(await listSessions({ all: true }), request.id, { usage: 'respawn <id>', name: false })
      if (active.has(target.id)) throw new Error(`Session already running: ${target.id}`)
      assertNoUnmanagedLiveWorker(target, new Set(active.keys()))
      const child = await launch({ ...target, state: 'starting', pid: null }, { resume: true })
      return { id: child.id, pid: child.pid }
    }
    case 'rm': {
      const found = matchSession(await listSessions({ all: true }), request.id, { usage: 'rm <id>', name: false })
      if (active.has(found.id)) await stop(found.id)
      else assertNoUnmanagedLiveWorker(found, new Set(active.keys()))
      await removeWorktreeSafely(found.worktreePath, request)
      await deleteSession(found.id)
      try { await unlink(found.logPath) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      return { id: found.id, removed: true }
    }
    case 'attach': {
      const found = matchSession(await listSessions({ all: true }), request.id, { usage: 'attach <id|name>' })
      let job = active.get(found.id)
      if (!job) {
        assertNoUnmanagedLiveWorker(found, new Set(active.keys()))
        await launch(found, { resume: true })
        job = active.get(found.id)
      }
      job.subscribers.add(socket)
      socket.backgroundSessionId = found.id
      const history = await readTail(job.record.logPath).catch(error => {
        if (error.code === 'ENOENT') return ''
        throw error
      })
      if (history) send(socket, { event: 'output', data: Buffer.from(history).toString('base64') })
      return { id: found.id, attached: true }
    }
    case 'input': {
      const job = active.get(socket.backgroundSessionId)
      if (!job?.subscribers.has(socket)) throw new Error('Session is no longer attached')
      job.proc.terminal?.write(Buffer.from(request.data, 'base64'))
      return { written: true }
    }
    case 'resize': {
      const job = active.get(socket.backgroundSessionId)
      if (!job?.subscribers.has(socket)) throw new Error('Session is no longer attached')
      if (Number.isInteger(request.cols) && Number.isInteger(request.rows)) {
        job.proc.terminal?.resize(Math.max(20, request.cols), Math.max(5, request.rows))
      }
      return { resized: true }
    }
    case 'detach': {
      const job = active.get(socket.backgroundSessionId)
      job?.subscribers.delete(socket)
      socket.backgroundSessionId = null
      return { detached: true }
    }
    case 'shutdown': {
      if (!request.keepWorkers) {
        for (const id of [...active.keys()]) await stop(id)
      } else if (active.size) {
        throw new Error('Cannot detach live PTYs without a supervisor handoff; sessions were left running')
      }
      setImmediate(() => server?.close())
      return { stopped: true }
    }
    default:
      throw new Error(`Unknown background daemon operation: ${String(request.op)}`)
  }
}
function attachSocket(socket) {
  serverClients.add(socket)
  let buffer = ''
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8')
    if (buffer.length > 2 * 1024 * 1024) {
      socket.destroy(new Error('Request too large'))
      return
    }
    let index
    index = buffer.indexOf('\n')
    while (index !== -1) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
      let request
      try { request = JSON.parse(line) }
      catch (error) { send(socket, { ok: false, error: `Invalid command JSON: ${error.message}` }); continue }
      void command(request, socket).then(
        data => send(socket, { ok: true, id: request.requestId, data }),
        error => send(socket, { ok: false, id: request.requestId, error: error.message })
      )
    }
  })
  socket.on('close', () => {
    serverClients.delete(socket)
    const session = active.get(socket.backgroundSessionId)
    session?.subscribers.delete(socket)
  })
  socket.on('error', error => process.stderr.write(`Background IPC client error: ${error.message}\n`))
}
export async function runBackgroundSupervisor() : Promise<void> {
  await prepareFleet()
  const path = fleetSocket()
  if (process.platform !== 'win32') await assertSocketVacant317(path, 'Background supervisor')
  server = createServer(attachSocket)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => { server.off('error', reject); resolve() })
  })
  if (process.platform !== 'win32') await chmod(path, 0o600)
  const socketOwner = process.platform === 'win32'
    ? undefined : await captureSocketIdentity317(path, 'Background supervisor')
  const shutdown = async () => {
    for (const id of [...active.keys()]) await stop(id)
    server.close()
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
  server.on('close', () => {
    if (socketOwner) void unlinkOwnedSocket317(path, socketOwner).catch(error => {
      process.stderr.write(`Cannot remove background socket: ${error.message}\n`)
    })
  })
  // Supervisor is kept alive while any sessions run, and shuts down when idle.
  idleTimer = setInterval(() => {
    if (active.size === 0 && serverClients.size === 0) server.close()
  }, 60_000)
  server.on('close', () => clearInterval(idleTimer))
}
