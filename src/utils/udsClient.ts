import { connect } from 'node:net'

/** Delivery succeeds only after the recipient acknowledges queue insertion. */
export async function sendToUdsSocket(socketPath: string, message: string): Promise<void> {
  if (!socketPath.startsWith('/') || !message.trim() || Buffer.byteLength(message, 'utf8') > 64 * 1024) {
    throw new Error('Invalid peer address or message size')
  }
  await new Promise<void>((resolve, reject) => {
    const socket = connect(socketPath)
    let receipt = ''
    socket.setTimeout(5000)
    socket.once('connect', () => socket.write(`${JSON.stringify({ message })}\n`))
    socket.on('data', chunk => {
      receipt += chunk.toString('utf8')
      if (receipt.length > 1024) { socket.destroy(new Error('Invalid peer receipt')); return }
      if (receipt.includes('\n')) {
        const line = receipt.slice(0, receipt.indexOf('\n'))
        socket.end()
        if (line === 'OK') resolve()
        else reject(new Error(`Peer rejected message: ${line}`))
      }
    })
    socket.once('error', reject)
    socket.once('timeout', () => socket.destroy(new Error('Peer receipt timed out')))
    socket.once('close', hadError => {
      if (!receipt.includes('\n') && !hadError) reject(new Error('Peer closed before acknowledgement'))
    })
  })
}

/** Registry enumeration shared with --continue: excludes dead processes, not
 * sessions lacking UDS (background workers can be registered without sockets).
 */
export async function listAllLiveSessions(): Promise<Array<{
  pid: number
  sessionId?: string
  kind?: string
  name?: string
  messagingSocketPath?: string
}>> {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { getClaudeConfigHomeDir } = await import('./envUtils.js')
  const directory = join(getClaudeConfigHomeDir(), 'sessions')
  let names: string[]
  try {
    names = await readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const sessions: Array<{
    pid: number
    sessionId?: string
    kind?: string
    name?: string
    messagingSocketPath?: string
  }> = []
  for (const name of names) {
    if (!/^\d+\.json$/.test(name)) continue
    const pid = Number(name.slice(0, -5))
    if (!Number.isSafeInteger(pid) || pid <= 1) continue
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(join(directory, name), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (!parsed || typeof parsed !== 'object') continue
    const row = parsed as Record<string, unknown>
    if (row.pid !== pid) continue
    sessions.push({
      pid,
      ...(typeof row.sessionId === 'string' ? { sessionId: row.sessionId } : {}),
      ...(typeof row.kind === 'string' ? { kind: row.kind } : {}),
      ...(typeof row.name === 'string' ? { name: row.name } : {}),
      ...(typeof row.messagingSocketPath === 'string'
        ? { messagingSocketPath: row.messagingSocketPath }
        : {}),
    })
  }
  return sessions
}
