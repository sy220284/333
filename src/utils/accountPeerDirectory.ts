import { createHash } from 'node:crypto'
// Claude Code 2.1.310 account session population: cloud and Remote Control.
const validId = /^(?:cse|session)_[A-Za-z0-9_-]+$/
export const canonicalId = id => validId.test(id ?? '') ? id.replace(/^(?:cse|session)_/, '') : ''
/** Bind names and bridge addresses to the authenticated account and organization. */
export const peerIdentityKey = (accessToken, orgUUID) =>
  accessToken && orgUUID ? createHash('sha256').update(`${orgUUID}\0${accessToken}`).digest('hex') : null
const active = row => row.acceptsPeerMessages !== false && !row.unreachableFromHere &&
  !['archived','offline','disconnected'].includes(row.status)
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
    selfId?: string; verifiedAccountList?: boolean } = {}) {
  const seen = new Set(local.map(p => canonicalId(p.bridgeSessionId)).filter(Boolean))
  if (canonicalId(selfId)) seen.add(canonicalId(selfId))
  const bridgeById = new Map()
  const bridgeReachable = row => verifiedAccountList && !!row && active({
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
  const peers = []
  const include = (row, kind, transport) => {
    const key = canonicalId(row?.id)
    if (!key || seen.has(key)) return
    seen.add(key)
    // A cloud snapshot may lag after a Remote Control session reconnects.
    // Only the verified live endpoint establishes actual reachability.
    const connected = bridgeReachable(transport)
    // Worker action state and delivery connectivity are independent signals.
    // A connected bridge keeps a cloud requires_action status meaningful;
    // a disconnected transport overrides a stale cloud active snapshot.
    const workerStatus = row.workerStatus ?? row.status
    const status = connected
      ? (!row.offline && workerStatus === 'requires_action'
        ? 'requires_action' : transport.workerStatus ?? transport.status ?? workerStatus ?? 'active')
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
    peers.push({ ...peer, address: active(peer) && connected
      ? `bridge:${transport.id}` : undefined })
  }
  for (const row of cloud) include(row, 'cloud', bridgeById.get(canonicalId(row?.id)))
  for (const row of bridge) include(row, 'remote_control', row)
  return peers
}
export function resolveRemoteRecipient(peers, token) {
  const m = /^(.+?) \[([A-Za-z0-9_-]{6})\]$/.exec(token)
  const found = peers.filter(p => m ? p.name === m[1] && p.ref === m[2] : p.name === token)
  return found.length === 1 && active(found[0]) ? found[0].address : undefined
}
let advertised = { time:0, peers:[], identityKey:null }
export function rememberAccountRecipients(peers, time = Date.now(), identityKey = null) {
  advertised = { time, identityKey, peers:peers.filter(active) }
}
const currentRecipients = (time, identityKey) =>
  identityKey === advertised.identityKey && time >= advertised.time && time - advertised.time <= 30000
    ? advertised.peers : []
/** Resolve from the *union* of local and account candidates so a colliding
 * name cannot silently select a different transport.
 */
export function resolveUnifiedPeerRecipient(local, token, time = Date.now(), identityKey = null) {
  const remote = currentRecipients(time, identityKey)
  const m = /^(.+?) \[([A-Za-z0-9_-]{6})\]$/.exec(token)
  const candidates = [...local, ...remote]
  const hits = candidates.filter(p => m ? p.name === m[1] && p.ref === m[2] :
    p.name === token)
  const addresses = [...new Set(hits.map(p => p.address).filter(Boolean))]
  return {address: hits.length === 1 && addresses.length === 1 ? addresses[0] : undefined,
    ambiguous: hits.length > 1}
}
export function resolveAdvertisedRemoteRecipient(token, time = Date.now(), identityKey = null) {
  return resolveRemoteRecipient(currentRecipients(time, identityKey), token)
}
async function walk(request, endpoint, headers, maxPages, cursorKey, normalize) {
  const rows=[], ids=new Set()
  let cursor=null, truncated=false
  const seenCursors=new Set()
  for (let page=0;page<maxPages;page++) {
    const url=new URL(endpoint)
    if(cursor) url.searchParams.set(cursorKey,cursor)
    let reply
    try { reply=await request(url.toString(),headers) }
    catch { return { rows, failed:true, truncated } }
    if(reply?.status!==200 || !Array.isArray(reply.data?.data)) return { rows, failed:true, truncated }
    for(const item of reply.data.data) {
      const row=normalize(item), key=canonicalId(row?.id)
      if(!key || ids.has(key)) continue
      ids.add(key);rows.push(row)
    }
    cursor=cursorKey==='cursor' ? reply.data.next_cursor :
      reply.data.has_more ? reply.data.last_id : null
    if(!cursor) break
    if(seenCursors.has(cursor)) return {rows,failed:true,truncated:true}
    seenCursors.add(cursor)
    if(page===maxPages-1) truncated=true
  }
  return { rows, failed:false, truncated }
}
export async function discoverAccountPeers({request,baseUrl,accessToken,orgUUID,local=[],selfId}) {
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
        {id:row.id,title:row.title,status:row.status,workerStatus:row.worker_status ?? row.status,
          acceptsPeerMessages:row.accepts_peer_messages!==false,
          offline:row.worker_status==='offline'} : null),
    walk(request,bridgeUrl,{...headers,'anthropic-beta':'ccr-byoc-2025-07-29',
      'x-organization-uuid':orgUUID},5,'after_id',row=>
      row && (row.session_status??row.status)!=='archived' ?
        {id:row.id,title:row.title,status:row.session_status??row.status,
         acceptsPeerMessages:row.accepts_peer_messages!==false &&
           row.external_metadata?.accepts_peer_messages!==false,
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
