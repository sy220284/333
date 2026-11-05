/**
 * Native 2.1.317 CRI JWT admission. A gateway only trusts an ES256 token
 * from the pinned issuer, with the exact audience and organization binding.
 */
import { createPublicKey, verify } from 'node:crypto'
export const CRI_ISSUER_317='https://api.anthropic.com/api/oauth/cri'
const TYPE='cri+jwt', MAX_STALE_MS=21600000, CACHE_MS=600000
const FETCH_TIMEOUT_MS=10000, COOLDOWN_MS=60000, SKEW_SECONDS=60
const loopback = host => new Set(['localhost','127.0.0.1','::1','[::1]']).has(host)
function safeEndpoint(value,kind,allowLoopback) {
  const url=new URL(value)
  if(url.username||url.password||url.search||url.hash)
    throw new Error(kind+' must not contain credentials, query or fragment')
  if(loopback(url.hostname)) {
    if(!allowLoopback)throw new Error(kind+' loopback endpoint requires CLAUDE_GATEWAY_ALLOW_LOOPBACK=1')
    if(!['http:','https:'].includes(url.protocol))throw new Error(kind+' requires http(s)')
  }else if(url.protocol!=='https:')throw new Error(kind+' requires HTTPS')
  return url.toString().replace(/\/$/,'')
}
export function validateCriConfig317(value,env: NodeJS.ProcessEnv=process.env) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('cri must be an object')
  const enabled=value.enabled===true
  if(value.enabled!==undefined&&typeof value.enabled!=='boolean')throw new Error('cri.enabled must be boolean')
  const audience=value.audience??[],org_allowlist=value.org_allowlist??[]
  for(const [field,list] of [['audience',audience],['org_allowlist',org_allowlist]]) {
    if(!Array.isArray(list)||list.some(x=>typeof x!=='string'||!x.trim()))
      throw new Error('cri.'+field+' must be a list of nonempty strings')
    if(enabled&&!list.length)throw new Error('cri.'+field+' must list at least one value when enabled')
  }
  const allowLoopback=env.CLAUDE_GATEWAY_ALLOW_LOOPBACK==='1'
  const issuer=safeEndpoint(value.issuer??CRI_ISSUER_317,'cri.issuer',allowLoopback)
  if(value.issuer&&value.issuer.endsWith('/'))throw new Error('cri.issuer must not end with /')
  const jwks_url=value.jwks_url
  if(jwks_url!==undefined) {
    if(!loopback(new URL(jwks_url).hostname))throw new Error('cri.jwks_url is for loopback tests only; production uses issuer/jwks.json')
    safeEndpoint(jwks_url,'cri.jwks_url',allowLoopback)
  }
  return {...value,enabled,audience:[...new Set(audience.map(x=>x.trim()))],
    org_allowlist:[...new Set(org_allowlist.map(x=>x.trim().toLowerCase()))],
    issuer,jwks_url:jwks_url??issuer+'/jwks.json'}
}
function parseJwsParts(token) {
  if(typeof token!=='string'||token.length>32768)return null
  const pieces=token.split('.')
  if(pieces.length!==3||pieces.some(x=>!x))return null
  try{
    const header=JSON.parse(Buffer.from(pieces[0],'base64url').toString('utf8'))
    const claims=JSON.parse(Buffer.from(pieces[1],'base64url').toString('utf8'))
    if(!header||typeof header!=='object'||Array.isArray(header)||
      !claims||typeof claims!=='object'||Array.isArray(claims))return null
    return {pieces,header,claims}
  }catch{return null}
}
export function isCriJwt317(token): boolean {return parseJwsParts(token)?.header.typ===TYPE}
export function createCriAdmission317(config,adapters: {now?: () => number; fetch?: typeof fetch} = {}) {
  if(!config.enabled)throw new Error('Cannot create CRI admission when disabled')
  const now=adapters.now??Date.now,fetchJwks=adapters.fetch??fetch
  const allowedOrgs=new Set(config.org_allowlist),audience=new Set(config.audience)
  let keys=new Map(),fetchedAt=0,expiresAt=0,lastAttempt=0,refreshing=null
  const failure=(status: number,reason: string)=>({ok:false as const,status,reason})
  async function refresh(force=false) {
    if(refreshing)return refreshing
    if(!force&&now()-lastAttempt<COOLDOWN_MS)return false
    lastAttempt=now()
    refreshing=(async()=>{
      try{
        const response=await fetchJwks(config.jwks_url,{method:'GET',redirect:'error',
          signal:AbortSignal.timeout(FETCH_TIMEOUT_MS)})
        if(!response.ok)return false
        const jwks=await response.json()
        if(!jwks||!Array.isArray(jwks.keys))return false
        const parsed=new Map()
        for(const key of jwks.keys){
          if(key?.kty!=='EC'||key?.crv!=='P-256'||typeof key.kid!=='string'||!key.kid||
            (key.alg&&key.alg!=='ES256')||(key.use&&key.use!=='sig'))continue
          try{parsed.set(key.kid,createPublicKey({key,format:'jwk'}))}catch{}
        }
        if(!parsed.size)return false
        keys=parsed;fetchedAt=now()
        const match=/(?:^|[,\s])max-age=(\d+)/i.exec(response.headers.get('cache-control')??'')
        expiresAt=fetchedAt+(match?Math.min(Number(match[1])*1000,MAX_STALE_MS/2):CACHE_MS)
        return true
      }catch{return false}
    })().finally(()=>{refreshing=null})
    return refreshing
  }
  async function validKeys(){
    if(keys.size&&now()<expiresAt)return keys
    if(keys.size&&now()-fetchedAt<=MAX_STALE_MS){void refresh();return keys}
    await refresh()
    return keys.size&&now()-fetchedAt<=MAX_STALE_MS?keys:null
  }
  return {
    async prime(){return refresh(true)},
    async authenticate(token){
      const current=await validKeys()
      if(!current)return failure(503,'jwks_unavailable')
      const parsed=parseJwsParts(token)
      if(!parsed||parsed.header.typ!==TYPE||parsed.header.alg!=='ES256'||
        typeof parsed.header.kid!=='string'||!parsed.header.kid)return failure(401,'invalid_token')
      let key=current.get(parsed.header.kid)
      if(!key){await refresh();key=keys.get(parsed.header.kid);if(!key)return failure(401,'invalid_token')}
      const {pieces,claims}=parsed
      try{
        if(!verify('sha256',Buffer.from(pieces[0]+'.'+pieces[1]),
          {key,dsaEncoding:'ieee-p1363'},Buffer.from(pieces[2],'base64url')))
          return failure(401,'invalid_token')
      }catch{return failure(401,'invalid_token')}
      const seconds=Math.floor(now()/1000)
      const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud]
      if(!audiences.some(x=>audience.has(x)))return failure(401,'audience_mismatch')
      if(claims.iss!==config.issuer||typeof claims.exp!=='number'||
        typeof claims.iat!=='number'||claims.exp<=seconds-SKEW_SECONDS||
        claims.iat>seconds+SKEW_SECONDS||
        (claims.nbf!==undefined&&(typeof claims.nbf!=='number'||claims.nbf>seconds+SKEW_SECONDS))||
        typeof claims.sub!=='string'||!claims.sub||claims.scope!=='inference'||
        typeof claims.org!=='string'||!claims.org)return failure(401,'invalid_token')
      const org=claims.org.toLowerCase()
      if(!allowedOrgs.has(org))return failure(401,'org_not_allowed')
      return {ok:true as const,claims:{sub:claims.sub,org,cri:true,
        ...(typeof claims.act?.sub==='string'?{act:{sub:claims.act.sub}}:{}),
        exp:claims.exp,iat:claims.iat}}
    },
  }
}
/** Ordered capability tokens preserve the native client's self-healing retries. */
export function classifyCriCapability317(status: number,message: string,betaHeader: string=''): string {
  if(status!==400&&status!==413)return null
  const text=String(message??'')
  if(/(?:system\s+(?:role|message)|role\s*[:=]\s*["']?system|mid.conversation.*system)/i.test(text)&&
     /(?:not allowed|unsupported|unrecognized|invalid|cannot|unexpected|cache.control|mid.conversation|reject)/i.test(text))
    return 'capability_rejected: mid_conv_system'
  if(/cache_control/i.test(text)&&/(?:unknown|invalid|unsupported|not allowed|extra|unrecognized|not permitted)/i.test(text))
    return 'capability_rejected: cache_control_field'
  if(/(?:invalid signature.*thinking|redacted_thinking.*(?:invalid|data)|thinking\.signature.*required|thinking.*cannot be modified)/i.test(text))
    return 'capability_rejected: thinking_signature'
  if(/(?:thinking\.type|adaptive thinking|thinking.*type)/i.test(text)&&
    /(?:unsupported|not supported|invalid|not allowed|requires)/i.test(text)){
    const mode=/(?:thinking\.type.*?\b(enabled|adaptive)\b|\b(adaptive|enabled)\b.*thinking)/i.exec(text)
    if(mode)return 'capability_rejected: thinking_type:'+(mode[1]??mode[2]).toLowerCase()
  }
  if(/output_config\.format/i.test(text)&&/(?:extra|unknown|unsupported|not permitted)/i.test(text))
    return 'capability_rejected: structured_outputs_unsupported'
  if(/(?:effort parameter|output_config.*(?:extra|requires a model|unsupported))/i.test(text)&&
    /(?:does not support|unsupported|not supported|extra|requires a model)/i.test(text))
    return 'capability_rejected: effort_unsupported'
  if(/(?:too much media|(?:\d+\s*(?:document pages|images)).*?\+.*?\d+)/i.test(text))
    return 'capability_rejected: media_budget'
  if(/(?:could not process image|image.*(?:size|dimensions|exceeds|unsupported)|messages\.\d+\.content\.\d+\.image)/i.test(text))
    return 'capability_rejected: image_block'
  if(/(?:could not process PDF|does not support PDFs?|document.*(?:page limit|unsupported)|messages\.\d+\.content\.\d+\.document)/i.test(text))
    return 'capability_rejected: document_block'
  if(/(?:prompt is too long|input is too long for requested model|context window.*exceed)/i.test(text))
    return 'capability_rejected: prompt_too_long'
  if(/input length and max_tokens exceed context limit/i.test(text))
    return 'capability_rejected: max_tokens_context_overflow'
  if(/(?:anthropic.beta|beta header|unknown beta)/i.test(text)&&
    /(?:invalid|unsupported|unknown|unrecognized|not allowed|not supported)/i.test(text)){
    const betas=String(betaHeader).split(',').map(x=>x.trim()).filter(Boolean)
    const matched=betas.find(beta=>text.includes(beta))
    if(matched)return 'capability_rejected: beta_header:'+matched
  }
  return null
}
