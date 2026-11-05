import { createHash } from 'node:crypto'
// Claude Code 2.1.310 account session population: cloud and Remote Control.
const validId = /^(?:cse|session)_[A-Za-z0-9_-]+$/
export const canonicalId = (id: string | null | undefined): string =>
  typeof id === 'string' && validId.test(id) ? id.replace(/^(?:cse|session)_/, '') : ''
/** Bind names and bridge addresses to the authenticated account and organization. */
export const peerIdentityKey = (accessToken: string, orgUUID: string): string | null =>
  accessToken && orgUUID ? createHash('sha256').update(`${orgUUID}\0${accessToken}`).digest('hex') : null
type PeerStatus317 = string
export type PeerDirectoryEntry317 = {
  name: string; id?: string; ref: string; kind: string; status: PeerStatus317
  acceptsPeerMessages: boolean; unreachableFromHere: boolean; address?: string
}
type PeerDirectoryRequest317 = (
  url: string, headers: Record<string, string>
) => Promise<unknown>
type PeerDiscoveryResult317 = {
  peers: PeerDirectoryEntry317[]
  notes: Array<{kind: string; text: string}>
  available: boolean
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const asOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined
const active = (row: { acceptsPeerMessages?: boolean; unreachableFromHere?: boolean; status?: string }): boolean => row.acceptsPeerMessages !== false && !row.unreachableFromHere &&
  !['archived','offline','disconnected'].includes(row.status ?? 'unknown')
/** Cloud list entries have no proven delivery route; only an active Remote
 * Control endpoint establishes a bridge address (2.1.310 chunk-xje85fg4).
 * Merge identity first so one session cannot appear twice or shadow its route.
 */
type PeerSnapshot317 = {
  id?: string; bridgeSessionId?: string; title?: string; status?: string;
  workerStatus?: string; offline?: boolean; remoteControl?: boolean;
  acceptsPeerMessages?: boolean; unreachableFromHere?: boolean;
}
export function mergeSessionPeers({ local = [], cloud = [], bridge = [], selfId, verifiedAccountList = true }:
  { local?: PeerSnapshot317[]; cloud?: PeerSnapshot317[]; bridge?: PeerSnapshot317[];
    selfId?: string; verifiedAccountList?: boolean } = {}): PeerDirectoryEntry317[] {
  const seen = new Set(local.map(p => canonicalId(p.bridgeSessionId)).filter(Boolean))
  if (canonicalId(selfId)) seen.add(canonicalId(selfId))
  const bridgeById = new Map<string, PeerSnapshot317>()
  const bridgeReachable = (row: PeerSnapshot317 | undefined): boolean => verifiedAccountList && !!row && !!canonicalId(row.id) && active({
    status: row.offline ? 'offline' : row.status,
    acceptsPeerMessages: row.acceptsPeerMessages,
    unreachableFromHere: row.unreachableFromHere,
  })
  for (const row of bridge) {
    const key = canonicalId(row?.id)
    if (!key || seen.has(key)) continue
    if (!bridgeById.has(key) || (!bridgeReachable(bridgeById.get(key)) && bridgeReachable(row)))
      bridgeById.set(key, row)
  }
  const peers: PeerDirectoryEntry317[] = []
  const include = (row: PeerSnapshot317, kind: 'cloud' | 'remote_control', transport?: PeerSnapshot317): void => {
    const key = canonicalId(row?.id)
    if (!key || seen.has(key)) return
    seen.add(key)
    // A cloud snapshot may lag after a Remote Control session reconnects.
    // Only the verified live endpoint establishes actual reachability.
    const transportId = bridgeReachable(transport) ? transport?.id : undefined
    const connected = !!transportId
    // Worker action state and delivery connectivity are independent signals.
    // A connected bridge keeps a cloud requires_action status meaningful;
    // a disconnected transport overrides a stale cloud active snapshot.
    const workerStatus = row.workerStatus ?? row.status
    const status = connected
      ? (!row.offline && workerStatus === 'requires_action'
        ? 'requires_action' : transport?.workerStatus ?? transport?.status ?? workerStatus ?? 'active')
      : (transport?.offline || row.offline ? 'offline' : workerStatus ?? 'unknown')
    const acceptsPeerMessages = row.acceptsPeerMessages !== false &&
      (transport ? transport.acceptsPeerMessages !== false : true)
    const peer = {
      name: String(row.title || transport?.title || '(untitled)'), id: row.id,
      ref: createHash('sha256').update(key).digest('hex').slice(0, 6),
      kind: row.remoteControl ? 'remote_control' : kind, status,
      acceptsPeerMessages,
      unreachableFromHere: !connected || !acceptsPeerMessages,
    }
    peers.push({ ...peer, address: active(peer) && transportId
      ? `bridge:${transportId}` : undefined })
  }
  for (const row of cloud) include(row, 'cloud', bridgeById.get(canonicalId(row?.id)))
  for (const row of bridge) include(row, 'remote_control', row)
  return peers
}
export function resolveRemoteRecipient(peers: ReadonlyArray<PeerDirectoryEntry317>, token: string): string | undefined {
  const m = /^(.+?) \[([A-Za-z0-9_-]{6})\]$/.exec(token)
  const found = peers.filter(p => m ? p.name === m[1] && p.ref === m[2] : p.name === token)
  return found.length === 1 && active(found[0]) ? found[0].address : undefined
}
let advertised: {time: number; peers: PeerDirectoryEntry317[]; identityKey: string | null} = { time:0, peers:[], identityKey:null }
export function rememberAccountRecipients(peers: PeerDirectoryEntry317[], time: number = Date.now(), identityKey: string | null = null): void {
  advertised = { time, identityKey, peers:peers.filter(active) }
}
const currentRecipients = (time: number, identityKey: string | null): PeerDirectoryEntry317[] =>
  identityKey === advertised.identityKey && time >= advertised.time && time - advertised.time <= 30000
    ? advertised.peers : []
/** Resolve from the *union* of local and account candidates so a colliding
 * name cannot silently select a different transport.
 */
export function resolveUnifiedPeerRecipient(local: ReadonlyArray<Pick<PeerDirectoryEntry317, 'name' | 'ref' | 'address'>>, token: string, time: number = Date.now(), identityKey: string | null = null): {address: string | undefined; ambiguous: boolean} {
  const remote = currentRecipients(time, identityKey)
  const m = /^(.+?) \[([A-Za-z0-9_-]{6})\]$/.exec(token)
  const candidates = [...local, ...remote]
  const hits = candidates.filter(p => m ? p.name === m[1] && p.ref === m[2] :
    p.name === token)
  const addresses = [...new Set(hits.map(p => p.address).filter(Boolean))]
  return {address: hits.length === 1 && addresses.length === 1 ? addresses[0] : undefined,
    ambiguous: hits.length > 1}
}
export function resolveAdvertisedRemoteRecipient(token: string, time: number = Date.now(), identityKey: string | null = null): string | undefined {
  return resolveRemoteRecipient(currentRecipients(time, identityKey), token)
}
async function walk(
  request: PeerDirectoryRequest317, endpoint: URL, headers: Record<string, string>,
  maxPages: number, cursorKey: 'cursor' | 'after_id',
  normalize: (item: Record<string, unknown>) => PeerSnapshot317 | null,
): Promise<{rows: PeerSnapshot317[]; failed: boolean; truncated: boolean}> {
  const rows: PeerSnapshot317[] = [], ids = new Set<string>()
  let cursor: string | null = null, truncated = false
  const seenCursors = new Set<string>()
  for (let page=0;page<maxPages;page++) {
    const url=new URL(endpoint)
    if(cursor) url.searchParams.set(cursorKey,cursor)
    let reply
    try { reply=await request(url.toString(),headers) }
    catch { return { rows, failed:true, truncated } }
    if(!isRecord(reply) || reply.status!==200 || !isRecord(reply.data) || !Array.isArray(reply.data.data)) return { rows, failed:true, truncated }
    for(const item of reply.data.data) {
      const row=isRecord(item)?normalize(item):null
      if (!row) continue
      const key=canonicalId(row.id)
      if (!key || ids.has(key)) continue
      ids.add(key);rows.push(row)
    }
    const pageData = reply.data
    const next = cursorKey==='cursor' ? pageData.next_cursor :
      pageData.has_more ? pageData.last_id : null
    cursor = typeof next === 'string' ? next : null
    if(!cursor) break
    if(seenCursors.has(cursor)) return {rows,failed:true,truncated:true}
    seenCursors.add(cursor)
    if(page===maxPages-1) truncated=true
  }
  return { rows, failed:false, truncated }
}
export async function discoverAccountPeers({
  request, baseUrl, accessToken, orgUUID, local=[], selfId,
}: {request: PeerDirectoryRequest317; baseUrl: string | URL; accessToken: string | null;
  orgUUID: string | null; local?: PeerSnapshot317[]; selfId?: string}): Promise<PeerDiscoveryResult317> {
  if(!accessToken||!orgUUID) return { peers:[], notes:[], available:false }
  const headers={Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',
    'anthropic-version':'2023-06-01'}
  const cloudUrl=new URL('/v1/code/sessions',baseUrl);cloudUrl.searchParams.set('limit','100')
  const bridgeUrl=new URL('/v1/sessions',baseUrl)
  const [cloud,bridge]=await Promise.all([
    walk(request,cloudUrl,headers,10,'cursor',row=>
      row && row.status!=='archived' && row.environment_kind!=='bridge' &&
      typeof row.title==='string' && row.title.trim() &&
      row.title!=='__warming__' && !row.title.includes('__CBU_POOLED__') &&
      !row.title.startsWith('ditto:') ?
        {id:asOptionalString(row.id),title:row.title,status:asOptionalString(row.status),workerStatus:asOptionalString(row.worker_status) ?? asOptionalString(row.status),
          acceptsPeerMessages:row.accepts_peer_messages!==false,
          offline:row.worker_status==='offline'} : null),
    walk(request,bridgeUrl,{...headers,'anthropic-beta':'ccr-byoc-2025-07-29',
      'x-organization-uuid':orgUUID},5,'after_id',row=>
      row && (row.session_status??row.status)!=='archived' ?
        {id:asOptionalString(row.id),title:asOptionalString(row.title),status:asOptionalString(row.session_status) ?? asOptionalString(row.status),
         acceptsPeerMessages:row.accepts_peer_messages!==false &&
           (!isRecord(row.external_metadata) || row.external_metadata.accepts_peer_messages!==false),
         offline:row.connection_status==='disconnected'} : null),
  ])
  const notes=[]
  if(cloud.failed) notes.push({kind:'cloud_list_failed',text:'(cloud session list could not be fetched just now — a later listing retries)'})
  if(bridge.failed) notes.push({kind:'account_list_failed',text:'(Remote Control session list could not be fetched just now — a later listing retries)'})
  if(cloud.truncated||bridge.truncated) notes.push({kind:'list_truncated',text:'(session list exceeded the page limit; some sessions are missing)'})
  // The official 2.1.310 treats cloud and Remote Control as independent
  // inventories: a failed cloud listing does not invalidate a fully fetched
  // Remote Control list. Only bridge enumeration controls bridge routing.
  // A partial bridge list cannot establish unique recipient names.
  const verifiedAccountList = !bridge.failed && !bridge.truncated
  return { peers:mergeSessionPeers({local,cloud:cloud.rows,bridge:bridge.rows,selfId,verifiedAccountList}),notes,available:true }
}
