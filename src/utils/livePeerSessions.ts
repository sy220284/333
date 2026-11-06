import { readdir, readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export type LiveLocalPeer317 = {
  id: string
  name: string
  ref: string
  address: string
  kind: string
  status: string
  startedAt?: string | number
  socketPath: string
  bridgeSessionId?: string
}
export type LiveLocalPeerList317 = { peers: LiveLocalPeer317[]; unreadable: boolean }
const isPeerRow = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function peerRef(socketPath: string) : string {
  return createHash('sha256').update(socketPath).digest('hex').slice(0, 6)
}
function running(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) { return error instanceof Error && 'code' in error && error.code === 'EPERM' }
}
/** Never advertise an address without a live owner and an actual socket. */
export async function listLiveLocalPeers(sessionsDir: string, ownPid: number = process.pid): Promise<LiveLocalPeerList317> {
  let files
  try { files = await readdir(sessionsDir) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { peers: [], unreadable: false }
    return { peers: [], unreadable: true }
  }
  const peers: LiveLocalPeer317[] = []
  let unreadable = false
  for (const filename of files) {
    if (!/^\d+\.json$/.test(filename)) continue
    const pid = Number(filename.slice(0, -5))
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === ownPid || !running(pid)) continue
    let row: unknown
    try { row = JSON.parse(await readFile(join(sessionsDir, filename), 'utf8')) }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) unreadable = true
      continue
    }
    if (!isPeerRow(row) || row.pid !== pid ||
        typeof row.messagingSocketPath !== 'string' || !row.messagingSocketPath.startsWith('/')) continue
    try {
      const entry = await lstat(row.messagingSocketPath)
      if (!entry.isSocket() || (process.getuid && entry.uid !== process.getuid())) continue
    } catch { continue }
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Claude session'
    peers.push({
      id: String(row.sessionId ?? pid), name,
      ref: peerRef(row.messagingSocketPath), address: `uds:${row.messagingSocketPath}`,
      kind: typeof row.kind === 'string' ? row.kind : 'interactive',
      status: typeof row.status === 'string' ? row.status : 'busy',
      ...(typeof row.startedAt === 'string' || typeof row.startedAt === 'number'
        ? { startedAt: row.startedAt } : {}),
      socketPath: row.messagingSocketPath,
      ...(typeof row.bridgeSessionId === 'string' ? { bridgeSessionId: row.bridgeSessionId } : {}),
    })
  }
  return { peers: peers.sort((a,b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address)), unreadable }
}
/** Resolve only live local peers. Duplicate names require an exact [ref]. */
export function resolveLocalPeerRecipient(peers: ReadonlyArray<LiveLocalPeer317>, token: string): {
  address: string | undefined
  ambiguous: boolean
} {
  const m = /^(.+?) \[([0-9a-f]{6})\]$/.exec(token)
  const matches = peers.filter(p => m ? p.name === m[1] && p.ref === m[2] : p.name === token)
  return {
    address: matches.length === 1 ? matches[0]?.address : undefined,
    ambiguous: matches.length > 1,
  }
}

export function resolveLocalPeerAddress(peers: ReadonlyArray<LiveLocalPeer317>, token: string): string | undefined {
  return resolveLocalPeerRecipient(peers, token).address
}
