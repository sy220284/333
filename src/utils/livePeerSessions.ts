import { readdir, readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export function peerRef(socketPath: string) : string {
  return createHash('sha256').update(socketPath).digest('hex').slice(0, 6)
}
function running(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error?.code === 'EPERM' }
}
/** Never advertise an address without a live owner and an actual socket. */
export async function listLiveLocalPeers(sessionsDir: string, ownPid = process.pid) {
  let files
  try { files = await readdir(sessionsDir) }
  catch (error) {
    if (error?.code === 'ENOENT') return { peers: [], unreadable: false }
    return { peers: [], unreadable: true }
  }
  const peers = []
  let unreadable = false
  for (const filename of files) {
    if (!/^\d+\.json$/.test(filename)) continue
    const pid = Number(filename.slice(0, -5))
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === ownPid || !running(pid)) continue
    let row
    try { row = JSON.parse(await readFile(join(sessionsDir, filename), 'utf8')) }
    catch (error) { if (error?.code !== 'ENOENT') unreadable = true; continue }
    if (row?.pid !== pid || typeof row.messagingSocketPath !== 'string' || !row.messagingSocketPath.startsWith('/')) continue
    try {
      const entry = await lstat(row.messagingSocketPath)
      if (!entry.isSocket() || (process.getuid && entry.uid !== process.getuid())) continue
    } catch { continue }
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Claude session'
    peers.push({
      id: String(row.sessionId ?? pid), name,
      ref: peerRef(row.messagingSocketPath), address: `uds:${row.messagingSocketPath}`,
      kind: row.kind ?? 'interactive', status: row.status ?? 'busy',
      startedAt: row.startedAt, socketPath: row.messagingSocketPath,
      ...(typeof row.bridgeSessionId === 'string' ? { bridgeSessionId: row.bridgeSessionId } : {}),
    })
  }
  return { peers: peers.sort((a,b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address)), unreadable }
}
/** A repeated name needs its [ref]; an unknown name is never silently routed. */
export function resolveLocalPeerAddress(peers, token) {
  const m = /^(.+?) \[([0-9a-f]{6})\]$/.exec(token)
  if (m) return peers.find(p => p.name === m[1] && p.ref === m[2])?.address
  const found = peers.filter(p => p.name === token)
  return found.length === 1 ? found[0].address : undefined
}
