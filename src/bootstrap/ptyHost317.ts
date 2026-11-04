import { createServer, type Socket } from 'node:net'
import { appendFileSync, chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import { assertSocketVacant317 } from './socketOwnership317.ts'
import { createPtyRecording317 } from './ptyRecording317.ts'
import { ptyExecFiles317 } from './ptyExecFiles317.ts'
import {
  createPtyFrameDecoder317, encodePtyControl317, encodePtyData317, PtyReplay317,
  PTY_CTRL_KIND_317, PTY_DATA_KIND_317, PTY_MAX_DIMENSION_317,
} from './ptyWire317.ts'

type PtyHostOptions317 = { spawn?: typeof Bun.spawn; terminal?: typeof Bun.Terminal }
const SOCKET_LIMIT = 1_048_576
const PEER_TIMEOUT_MS = 5000
const TERM_TIMEOUT_MS = 5000
const VERSION = '2.1.317'
function tokenMatches(value: unknown, expected?: string): boolean {
  if (!expected || typeof value !== 'string') return false
  const left = Buffer.from(value), right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}
function removeSocket(path: string): void {
  try { unlinkSync(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
export function assertPtySocketVacant317(path: string): Promise<void> {
  return assertSocketVacant317(path, 'PTY host')
}
function recordFailure(path: string | undefined, error: string): void {
  if (!path) return
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path + '.err', new Date().toISOString() + ' ' + error + '\n')
  } catch (failure) {
    process.stderr.write('ptyHost: could not write failure log: ' + String(failure) + '\n')
  }
}
export function parsePtyHostArgs317(args: string[]):
  { socket: string; cols: number; rows: number; command: string[]; spawnSpare: boolean } {
  const separator = args.indexOf('--')
  if (separator < 3 || separator === args.length - 1 || !args[0])
    throw Error('bad argv: --bg-pty-host <sock> <cols> <rows> -- <file> [args...]')
  return {
    socket: args[0],
    cols: Number(args[1]) || 200,
    rows: Number(args[2]) || 50,
    command: args.slice(separator + 1),
    spawnSpare: args.slice(separator + 1).includes('--bg-spare'),
  }
}

/** 317 PTY host: Bun native terminal, multi-peer socket, replay, resize,
 * kill, token gate, inactivity watchdog, process signals and exit frame. */
export async function runPtyHost317(args: string[], options: PtyHostOptions317 = {}): Promise<number> {
  let target
  try { target = parsePtyHostArgs317(args) }
  catch (error) {
    recordFailure(args[0], String(error))
    process.stderr.write(String(error) + '\n')
    return 1
  }
  const { socket, cols, rows, command, spawnSpare } = target
  const peers = new Set<Socket>()
  const authorized = new WeakSet<Socket>()
  const authAsked = new WeakSet<Socket>()
  const heartbeat = new WeakMap<Socket, { armed: boolean; missed: number }>()
  const replay = new PtyReplay317()
  // Exact upstream CLAUDE_PTY_RECORD format: dimensions then timed raw chunks.
  const recording = createPtyRecording317(process.env.CLAUDE_PTY_RECORD, cols, rows)
  let ptyAuth = process.env.CLAUDE_BG_PTY_AUTH
  delete process.env.CLAUDE_BG_PTY_AUTH
  const tokensPath = process.env.CLAUDE_BG_SOCKET_TOKENS_PATH
  if (tokensPath) {
    try {
      const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'))
      if (typeof tokens?.ptyAuth === 'string') ptyAuth = tokens.ptyAuth
      else if (!ptyAuth) recordFailure(socket, 'tokens-file unreadable; DATA gate fail-open')
    } catch {
      if (!ptyAuth) recordFailure(socket, 'tokens-file unreadable; DATA gate fail-open')
    }
  }
  const execMode = process.env.CLAUDE_PTY_HOST_EXEC === '1'
  const execFiles = execMode
    ? ptyExecFiles317(socket, (await import('../utils/envUtils.js')).getClaudeConfigHomeDir())
    : undefined
  delete process.env.CLAUDE_PTY_HOST_EXEC
  // 317 exec-mode consumes the credentials file and drops its path from the child.
  if (execMode && tokensPath) {
    delete process.env.CLAUDE_BG_SOCKET_TOKENS_PATH
    try { unlinkSync(tokensPath) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const admitSilent = process.env.CLAUDE_BG_SOCK_ADMIT_SILENT_PEERS === '1'
  if (execMode) delete process.env.CLAUDE_BG_SOCK_ADMIT_SILENT_PEERS
  const immediateHello = admitSilent || (!ptyAuth && !tokensPath)
  const timeoutMs = Number(process.env.CLAUDE_BG_SILENT_PEER_TIMEOUT_MS) || PEER_TIMEOUT_MS
  let terminal: Bun.Terminal | undefined
  let child: ReturnType<typeof Bun.spawn> | undefined
  let server: ReturnType<typeof createServer> | undefined
  let ownsSocket = false
  let stopped = false, forceClosed = false, lastExitCode = 0, lastSignal: string | number | undefined
  let ptyReceivedData = false
  let terminalClosed = false
  const closeTerminalOnce = () => {
    if (!terminal || terminalClosed) return
    terminalClosed = true
    terminal.close()
  }
  const timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = []
  const closeHandlers: Array<[NodeJS.Signals, () => void]> = []
  const send = (peer: Socket, frame: Buffer) => {
    if (!peer.destroyed) {
      if (peer.writableLength > SOCKET_LIMIT) peer.destroy()
      else peer.write(frame)
    }
  }
  const broadcast = (frame: Buffer) => { for (const peer of peers) send(peer, frame) }
  const forceTerminate = (signal: NodeJS.Signals) => {
    if (!child || stopped) return
    try { child.kill(signal) }
    catch (error) { recordFailure(socket, 'kill failed: ' + String(error)) }
  }
  const control = (payload: Record<string, unknown>) => {
    switch (payload.t) {
      case 'resize': {
        const c = Number(payload.cols), r = Number(payload.rows)
        if (c > 0 && c <= PTY_MAX_DIMENSION_317 && r > 0 && r <= PTY_MAX_DIMENSION_317 &&
          !stopped && !forceClosed) {
          terminal?.resize(c, r)
          if (process.platform !== 'win32') forceTerminate('SIGWINCH')
        }
        return
      }
      case 'kill': {
        const sig = payload.sig === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM'
        if (sig === 'SIGTERM') {
          forceTerminate('SIGTERM')
          const timer = setTimeout(() => { if (!stopped) forceTerminate('SIGKILL') }, TERM_TIMEOUT_MS)
          timer.unref(); timers.push(timer)
        } else forceTerminate('SIGKILL')
        return
      }
    }
  }
  try {
    await assertPtySocketVacant317(socket)
    // Keep host auth credentials out of the newly launched terminal session.
    terminal = new Bun.Terminal({ cols, rows, data(_terminal, data) {
      const chunk = Buffer.from(data)
      ptyReceivedData = true
      replay.push(chunk)
      recording?.write(chunk)
      broadcast(encodePtyData317(chunk))
    } })
    child = Bun.spawn(command, { cwd: process.cwd(), windowsHide: true, detached: false,
      env: { ...process.env, TERM: 'xterm-256color' }, terminal,
      ...(spawnSpare ? { argv0: 'claude bg-spare' } : {}),
    })
    try {
      server = createServer(peer => {
        peers.add(peer)
        peer.on('error', () => peer.destroy())
        peer.once('close', () => peers.delete(peer))
        peer.setNoDelay(true)
        let hello = false
        const admit = () => {
          if (hello || peer.destroyed) return
          hello = true
          peer.setTimeout(0)
          send(peer, encodePtyControl317({ t: 'hello', replPid: child?.pid, version: VERSION }))
          for (const frame of replay.frames()) send(peer, frame)
          send(peer, encodePtyControl317({ t: 'live' }))
          heartbeat.set(peer, { armed: false, missed: 0 })
          send(peer, encodePtyControl317({ t: 'ping' }))
          if (stopped) {
            send(peer, encodePtyControl317({ t: 'exit', code: lastExitCode, signal: lastSignal }))
            peer.end()
          }
        }
        if (immediateHello) admit()
        else peer.setTimeout(timeoutMs, () => peer.destroy())
        const receive = createPtyFrameDecoder317(frame => {
          if (!hello) admit()
          if (frame.kind === PTY_DATA_KIND_317) {
            if (ptyAuth && !authorized.has(peer)) {
              if (!authAsked.has(peer)) {
                authAsked.add(peer)
                send(peer, encodePtyControl317({ t: 'auth-required' }))
              }
              return
            }
            if (!stopped && !forceClosed) terminal?.write(frame.payload)
          } else if (frame.kind === PTY_CTRL_KIND_317) {
            // Upstream's frame decoder admits all valid JSON. Only object
            // controls carry actions; primitive JSON has no control fields.
            const ctrl = frame.ctrl
            if (!ctrl || typeof ctrl !== 'object' || Array.isArray(ctrl)) return
            const packet = ctrl as Record<string, unknown>
            if (packet.t === 'auth' && tokenMatches(packet.token, ptyAuth)) authorized.add(peer)
            else if (packet.t === 'pong') {
              const state = heartbeat.get(peer)
              if (state) { state.armed = true; state.missed = 0 }
            } else control(packet)
          }
        }, () => peer.destroy())
        peer.on('data', receive)
      })
      server.on('error', error => { recordFailure(socket, 'server error: ' + String(error)); forceTerminate('SIGTERM') })
      await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve)
        server!.once('error', reject)
        server!.listen(socket)
      })
      ownsSocket = true
      if (process.platform !== 'win32') chmodSync(socket, 0o600)
      server.unref()
    } catch (error) {
      forceTerminate('SIGTERM')
      throw error
    }
    const originalParent = process.ppid
    if (process.platform !== 'win32') {
      const pulse = setInterval(() => {
        if (stopped) return
        for (const peer of peers) {
          const state = heartbeat.get(peer)
          if (!state?.armed) continue
          if (++state.missed >= 3) peer.destroy()
          else send(peer, encodePtyControl317({ t: 'ping' }))
        }
      }, Number(process.env.CLAUDE_PTY_HEARTBEAT_MS) || 60000)
      pulse.unref(); timers.push(pulse)
      let missing = 0
      const watchdog = setInterval(() => {
        if (stopped) return
        if (process.ppid === originalParent || peers.size) { missing = 0; return }
        if (++missing >= 30) {
          recordFailure(socket, 'orphan watchdog: parent changed without clients')
          forceTerminate('SIGTERM')
        }
      }, Number(process.env.CLAUDE_PTY_ORPHAN_CHECK_MS) || 2000)
      watchdog.unref(); timers.push(watchdog)
    }
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
      const handler = () => forceTerminate(sig === 'SIGHUP' ? 'SIGTERM' : sig)
      process.on(sig, handler)
      closeHandlers.push([sig, handler])
    }
    lastExitCode = await child.exited
    // Official PTY drains terminal events until two consecutive 5ms quiet
    // periods after process exit (up to 20 attempts). Closing the terminal
    // immediately can discard the tail of a fast subprocess's output.
    let quietTicks = 0
    for (let attempt = 0; attempt < 20; attempt++) {
      ptyReceivedData = false
      await new Promise(resolve => setTimeout(resolve, 5))
      if (ptyReceivedData) quietTicks = 0
      else if (++quietTicks >= 2) break
    }
    lastSignal = child.signalCode == null ? undefined : String(child.signalCode)
    if (execMode) {
      // Original chunk-2bqkbqq9.js persists exec-mode exit metadata before
      // broadcasting the final frame. Drop any UTF-8 continuation bytes that
      // fall at the 4096-byte tail boundary.
      const rawTail = replay.tail(4096)
      let boundary = 0
      while (boundary < 3 && boundary < rawTail.length &&
             (rawTail[boundary]! & 0xc0) === 0x80) boundary++
      const tail = rawTail.subarray(boundary).toString('utf8')
      try {
        mkdirSync(dirname(execFiles!.exit), { recursive: true, mode: 0o700 })
        writeFileSync(execFiles!.exit,
          JSON.stringify({ code: lastExitCode,
            ...(lastSignal === undefined ? {} : { signal: lastSignal }), tail }),
          { mode: 0o600 })
      } catch (error) {
        recordFailure(socket, 'exec-exit write failed: ' + String(error))
      }
    }
    stopped = true
    closeTerminalOnce()
    broadcast(encodePtyControl317({ t: 'exit', code: lastExitCode, ...(lastSignal ? { signal: lastSignal } : {}) }))
    // Original host keeps a 5s grace window for a late PTY subscriber after
    // the worker exits. Exec-mode also persists the undelivered raw tail.
    if (peers.size === 0) {
      await new Promise<void>(resolve => {
        const onLateConnection = (latePeer: Socket) => {
          clearTimeout(timeout)
          // The server already sends hello/replay/live/exit on admission.
          // Allow the exit frame to flush before closing its socket.
          latePeer.once('close', () => resolve())
          const safety = setTimeout(resolve, 2000)
          safety.unref()
        }
        const timeout = setTimeout(() => {
          server?.off('connection', onLateConnection)
          resolve()
        }, 5000)
        server?.once('connection', onLateConnection)
      })
      if (execMode) {
        try {
          const raw = Buffer.concat(replay.frames().map(frame => frame.subarray(5)))
          mkdirSync(dirname(execFiles!.late), { recursive: true, mode: 0o700 })
          writeFileSync(execFiles!.late, raw, { mode: 0o600 })
        } catch (error) {
          recordFailure(socket, 'late PTY output write failed: ' + String(error))
        }
      }
    }
    // Flush the exit frame to attached clients before socket teardown.
    const closingPeers = [...peers]
    for (const peer of closingPeers) peer.end()
    await Promise.race([
      Promise.all(closingPeers.map(peer => new Promise<void>(resolve => {
        if (peer.destroyed) { resolve(); return }
        peer.once('close', () => resolve())
      }))),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ])
    return lastExitCode
  } catch (error) {
    recordFailure(socket, 'spawn/server failed: ' + String(error))
    process.stderr.write('ptyHost: ' + String(error) + '\n')
    return 1
  } finally {
    forceClosed = true
    for (const timer of timers) clearInterval(timer)
    for (const [sig, handler] of closeHandlers) process.off(sig, handler)
    if (!stopped) forceTerminate('SIGTERM')
    closeTerminalOnce()
    recording?.close()
    for (const peer of peers) peer.destroy()
    await new Promise(resolve => server?.close(() => resolve(undefined)) ?? resolve(undefined))
    if (ownsSocket && process.platform !== 'win32') removeSocket(socket)
  }
}
