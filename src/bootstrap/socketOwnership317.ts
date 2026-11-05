import { connect } from 'node:net'
import { lstat, unlink } from 'node:fs/promises'

/** A stale Unix socket may be reclaimed; a live owner or non-socket is protected.
 * Used by all 317 warm-worker listeners before bind(). A caller must only
 * clean up its socket after its own listen() has succeeded. */
export async function assertSocketVacant317(path: string, label: string = 'Worker'): Promise<void> {
  let initial
  try { initial = await lstat(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (!initial.isSocket()) throw new Error(label + ' path exists and is not a socket: ' + path)
  await new Promise<void>((resolve, reject) => {
    const peer = connect(path)
    let done = false
    const settle = (error?: Error, graceful = false) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (graceful) { peer.resume(); peer.end(); peer.unref() }
      else peer.destroy()
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => settle(new Error(label + ' socket ownership probe timed out: ' + path)), 1500)
    peer.once('connect', () => settle(new Error('Another ' + label + ' already owns ' + path), true))
    peer.once('error', error => {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ECONNREFUSED' || code === 'ENOENT') settle()
      else settle(error)
    })
  })
  let current
  try { current = await lstat(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  // Prevent removing a newer owner after the stale-socket probe.
  if (!current.isSocket() || current.dev !== initial.dev || current.ino !== initial.ino)
    throw new Error(label + ' socket changed during ownership check: ' + path)
  await unlink(path)
}

/** An owner snapshot taken only after a successful bind. */
export type SocketIdentity317 = { readonly dev: number; readonly ino: number }
export async function captureSocketIdentity317(path: string, label: string): Promise<SocketIdentity317> {
  const stat = await lstat(path)
  if (!stat.isSocket()) throw new Error(label + ' is not bound to a socket: ' + path)
  return { dev: stat.dev, ino: stat.ino }
}

/** Never unlink a pathname now belonging to a replacement listener. */
export async function unlinkOwnedSocket317(path: string, owner: SocketIdentity317): Promise<boolean> {
  let current
  try { current = await lstat(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  if (!current.isSocket() || current.dev !== owner.dev || current.ino !== owner.ino)
    return false
  await unlink(path)
  return true
}
