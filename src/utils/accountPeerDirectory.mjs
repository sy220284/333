// Claude Code 2.1.310 account session population: cloud and Remote Control.
const validId = /^(?:cse|session)_[A-Za-z0-9_-]+$/
export const canonicalId = id => validId.test(id ?? '') ? id.replace(/^(?:cse|session)_/, '') : ''
const active = row => row.acceptsPeerMessages !== false && !row.unreachableFromHere &&
  !['archived','offline','disconnected'].includes(row.status)
export function mergeSessionPeers({ local = [], cloud = [], bridge = [], selfId } = {}) {
  const existing = new Set(local.map(p => canonicalId(p.bridgeSessionId)).filter(Boolean))
  if (canonicalId(selfId)) existing.add(canonicalId(selfId))
  const peers = []
  for (const [source, entries] of [['cloud',cloud],['remote_control',bridge]]) {
    for (const row of entries) {
      const key = canonicalId(row?.id)
      if (!key || existing.has(key)) continue
      existing.add(key)
      const status = row.offline ? 'offline' : row.workerStatus ?? row.status ?? 'unknown'
      const peer = { name: String(row.title || '(untitled)'), id: row.id, ref: key.slice(0,6),
        kind: row.remoteControl ? 'remote_control' : source, status,
        acceptsPeerMessages: row.acceptsPeerMessages !== false,
        unreachableFromHere: !!row.unreachableFromHere || row.offline === true }
      peers.push({ ...peer, address: active(peer) ? `bridge:${row.id}` : undefined })
    }
  }
  return peers
}
export function resolveRemoteRecipient(peers, token) {
  const m = /^(.+?) \[([A-Za-z0-9_-]{6})\]$/.exec(token)
  const found = peers.filter(p => m ? p.name === m[1] && p.ref === m[2] : p.name === token)
  return found.length === 1 && active(found[0]) ? found[0].address : undefined
}
let advertised = { time:0, peers:[] }
export function rememberAccountRecipients(peers, time = Date.now()) {
  advertised = { time, peers:peers.filter(active) }
}
export function resolveAdvertisedRemoteRecipient(token, time = Date.now()) {
  return time >= advertised.time && time - advertised.time <= 30000 ?
    resolveRemoteRecipient(advertised.peers, token) : undefined
}
async function walk(request, endpoint, headers, maxPages, cursorKey, normalize) {
  const rows=[], ids=new Set()
  let cursor=null, truncated=false
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
  return { peers:mergeSessionPeers({local,cloud:cloud.rows,bridge:bridge.rows,selfId}),notes,available:true }
}
