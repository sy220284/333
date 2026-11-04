import { createServer, type Server } from 'node:net'
import { createHash, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, readFileSync, unlinkSync } from 'node:fs'
import { runClaimedSession317 } from './preload317.ts'

const MAX_CLAIM_BYTES = 8 * 1024 * 1024
function removeSocket(path: string): void {
  try { unlinkSync(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
function authEquals(left: unknown, right: string): boolean {
  if (typeof left !== 'string') return false
  const a = Buffer.from(left), b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
export type BgSpareClaim317 = {
  cwd: string
  env: Record<string, unknown>
  argv: string[]
  sessionId?: string
  auth?: string
}
export type BgSpareOptions317 = {
  onClaim?: (claim: BgSpareClaim317) => Promise<void>
}
/**
 * 2.1.317 chunk-f908v4te.js KYi + chunk-hw1ka40w.js zt + gUn.
 * Accept exactly one authenticated socket claim. Bad auth/oversized frames
 * are rejected per connection without consuming the spare.
 */
export async function runBgSpare317(args: string[],
  { onClaim = runClaimedSession317 }: BgSpareOptions317 = {}): Promise<number> {
  const socketPath = args[0]
  if (!socketPath) {
    process.stderr.write('[bg-spare] missing claim sock path\n')
    return 2
  }
  const inheritedAuth = process.env.CLAUDE_BG_CLAIM_AUTH
  const tokensPath = process.env.CLAUDE_BG_SOCKET_TOKENS_PATH
  delete process.env.CLAUDE_BG_CLAIM_AUTH
  delete process.env.CLAUDE_BG_SOCKET_TOKENS_PATH
  let expectedAuth = inheritedAuth
  if (tokensPath) {
    try {
      const data: unknown = JSON.parse(readFileSync(tokensPath, 'utf8'))
      const token = (data && typeof data === 'object' &&
        !Array.isArray(data)) ? (data as Record<string, unknown>).claimAuth : null
      if (typeof token === 'string' && token) expectedAuth = token
    } catch (error) {
      process.stderr.write('[bg-spare] tokens file unreadable; claim gate degraded\n')
    } finally {
      removeSocket(tokensPath)
    }
  }
  const startingParent = process.ppid
  const cleanup = () => removeSocket(socketPath)
  const interrupted = () => { cleanup(); process.exit(0) }
  const onUnhandled = (error: unknown) => {
    cleanup()
    process.stderr.write('[bg-spare] uncaughtException: ' + String(error) + '\n')
    process.exit(1)
  }
  let server: Server | undefined
  let selected = false
  let resolveClaim: (claim: BgSpareClaim317) => void = () => {}
  let rejectClaim: (reason: Error) => void = () => {}
  const claimPromise = new Promise<BgSpareClaim317>((resolve, reject) => {
    resolveClaim = resolve
    rejectClaim = reject
  })
  const watchdog = setInterval(() => {
    if (process.ppid !== startingParent) interrupted()
  }, 2000)
  watchdog.unref()
  const signals = ['SIGTERM', 'SIGHUP', 'SIGINT'] as const
  for (const name of signals) process.on(name, interrupted)
  process.on('uncaughtException', onUnhandled)
  try {
    if (existsSync(socketPath)) {
      if (!lstatSync(socketPath).isSocket())
        throw Error('Background spare path exists and is not a socket: ' + socketPath)
      cleanup()
    }
    server = createServer(peer => {
      let buffer = ''
      peer.setEncoding('utf8')
      peer.on('error', () => peer.destroy())
      peer.on('data', (chunk: string) => {
        if (selected) return
        buffer += chunk
        if (Buffer.byteLength(buffer, 'utf8') > MAX_CLAIM_BYTES) {
          peer.destroy()
          return
        }
        const end = buffer.indexOf('\n')
        if (end === -1) return
        let frame: BgSpareClaim317
        try { frame = JSON.parse(buffer.slice(0, end)) }
        catch (error) {
          peer.destroy()
          if (!expectedAuth) rejectClaim(error as Error)
          return
        }
        if (expectedAuth && !authEquals(frame?.auth, expectedAuth)) {
          peer.destroy()
          return
        }
        selected = true
        peer.end()
        server!.close()
        resolveClaim(frame)
      })
    })
    server.on('error', error => { if (!selected) rejectClaim(error) })
    await new Promise<void>((resolve, reject) => {
      server!.once('listening', resolve)
      server!.once('error', reject)
      server!.listen(socketPath)
    })
    if (process.platform !== 'win32') chmodSync(socketPath, 0o600)
    const claim = await claimPromise
    cleanup()
    clearInterval(watchdog)
    for (const name of signals) process.off(name, interrupted)
    process.off('uncaughtException', onUnhandled)
    try {
      await onClaim(claim)
      return process.exitCode ?? 0
    } catch (error) {
      process.stderr.write('[bg-spare] post-claim init failed: ' + String(error) + '\n')
      return 1
    }
  } catch (error) {
    process.stderr.write('[bg-spare] claim recv failed: ' + String(error) + '\n')
    return 1
  } finally {
    clearInterval(watchdog)
    for (const name of signals) process.off(name, interrupted)
    process.off('uncaughtException', onUnhandled)
    if (server?.listening) server.close()
    cleanup()
  }
}
