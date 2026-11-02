import { createServer, type Server } from 'node:net'
import { chmod, mkdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { registerCleanup } from './cleanupRegistry.js'

let activeServer: Server | null = null
let currentPath: string | undefined

export function getDefaultUdsSocketPath(): string {
  const base = tmpdir().length > 35 ? '/tmp' : tmpdir()
  return join(base, `claude-peer-${process.getuid?.() ?? 'user'}-${process.pid}-${randomUUID().slice(0, 8)}.sock`)
}
export function getMessagingSocketPath(): string | undefined { return currentPath }

/** Binding must finish before registerSession() advertises the socket path. */
export async function startUdsMessaging(socketPath = getDefaultUdsSocketPath()): Promise<void> {
  if (process.platform === 'win32' || activeServer) return
  if (!socketPath.startsWith('/') || Buffer.byteLength(socketPath) > 95) throw new Error('UDS socket must be a short absolute path')
  await mkdir(dirname(socketPath), { recursive: true })
  const server = createServer(socket => {
    let data = ''
    let handled = false
    socket.setTimeout(5000)
    socket.on('data', async chunk => {
      if (handled) return
      data += chunk.toString('utf8')
      if (Buffer.byteLength(data) > 65536 + 256) { handled = true; socket.end('ERR size\n'); return }
      const newline = data.indexOf('\n')
      if (newline < 0) return
      handled = true
      let parsed: unknown
      try { parsed = JSON.parse(data.slice(0, newline)) }
      catch { socket.end('ERR json\n'); return }
      const value = parsed as { message?: unknown }
      if (typeof value?.message !== 'string' || !value.message.trim() || Buffer.byteLength(value.message) > 65536) {
        socket.end('ERR message\n'); return
      }
      try {
        const { enqueuePendingNotification } = await import('./messageQueueManager.js')
        enqueuePendingNotification({ mode: 'prompt', value: value.message, priority: 'later' })
        socket.end('OK\n')
      } catch { socket.end('ERR delivery\n') }
    })
    socket.once('timeout', () => socket.end('ERR timeout\n'))
    socket.on('error', () => {})
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, () => { server.removeListener('error', reject); resolve() })
    })
    await chmod(socketPath, 0o600)
  } catch (error) {
    server.close()
    throw error
  }
  activeServer = server
  currentPath = socketPath
  process.env.CLAUDE_CODE_MESSAGING_SOCKET = socketPath
  registerCleanup(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await unlink(socketPath)
    if (currentPath === socketPath) currentPath = undefined
  })
}
