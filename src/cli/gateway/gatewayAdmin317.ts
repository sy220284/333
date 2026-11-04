/**
 * Administrative spend-limit HTTP API, matching 2.1.317's route, credential
 * scopes and payload shapes. All mutations are delegated to the durable
 * PostgreSQL store and audited in the same SQL transaction.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { verifyGatewaySession317 } from './gatewayAuth317.ts'
import { spendPeriodStart317 } from './gatewaySpendStore317.ts'

export const GATEWAY_SPEND_BASE_317 = '/v1/organizations/spend_limits'
export const GATEWAY_COST_PATH_317 = '/v1/organizations/analytics/cost'
const VALID_SCOPES = new Set(['organization','user','rbac_group'])
const VALID_PERIODS = new Set(['daily','weekly','monthly'])

export function validateGatewayAdmin317(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('admin must be an object')
  }
  const ids = new Set()
  const keys = {}
  for (const kind of ['read_keys','write_keys']) {
    const list = value[kind] ?? []
    if (!Array.isArray(list)) throw new Error('admin.'+kind+' must be an array')
    keys[kind] = list.map(entry => {
      if (!entry || typeof entry !== 'object' ||
        typeof entry.id !== 'string' || !entry.id.trim() ||
        typeof entry.key !== 'string' || Buffer.byteLength(entry.key) < 32) {
        throw new Error('admin.'+kind+' entries require a unique id and a key at least 32 bytes long')
      }
      if (ids.has(entry.id)) throw new Error('Duplicate admin key id: '+entry.id)
      ids.add(entry.id)
      return {id:entry.id,key:entry.key}
    })
  }
  const admin_groups = value.admin_groups ?? []
  if (!Array.isArray(admin_groups) || admin_groups.some(x =>
    typeof x !== 'string' || !x.trim())) {
    throw new Error('admin.admin_groups must contain group names')
  }
  const group_limit_mode = value.group_limit_mode ?? 'min'
  if (!['min','max'].includes(group_limit_mode)) throw new Error('admin.group_limit_mode must be min or max')
  return { ...value, ...keys, admin_groups, group_limit_mode }
}

function matchAdminKey(token, keys) {
  if (typeof token !== 'string') return null
  const value = Buffer.from(token)
  let id
  for (const entry of keys) {
    const secret = Buffer.from(entry.key)
    if (value.length === secret.length && timingSafeEqual(value,secret)) id=entry.id
  }
  return id
}
export function identifyGatewayAdmin317(request: { headers: { get: (arg0: string) => string } }, config, publicUrl) {
  const presented = request.headers.get('x-api-key')
  if (presented) {
    const writeId = matchAdminKey(presented,config.admin.write_keys)
    const readId = matchAdminKey(presented,config.admin.read_keys)
    if (writeId) return {canWrite:true,actor:'admin-key:'+writeId}
    if (readId) return {canWrite:false,actor:'admin-key:'+readId}
    return null
  }
  const auth = request.headers.get('authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const identity = bearer && verifyGatewaySession317(
    bearer,config.session.jwt_secret,publicUrl)
  if (identity && Array.isArray(identity.groups) &&
    identity.groups.some(group => config.admin.admin_groups.includes(group))) {
    return {canWrite:true,actor:'oidc:'+identity.sub,identity}
  }
  return null
}
export function isGatewayAdminPath317(path: string) {
  return path === GATEWAY_COST_PATH_317 || path === GATEWAY_SPEND_BASE_317 ||
    path.startsWith(GATEWAY_SPEND_BASE_317+'/')
}
const apiError = (status,message,requestId) => Response.json({
  type:'error',error:{type: status===401?'authentication_error':
    status===403?'permission_error':status===404?'not_found_error':'invalid_request_error',
    message},
},{
  status,headers:{'request-id':requestId,'cache-control':'no-store'},
})
function queryLimit(url,defaultLimit=20) {
  const raw = url.searchParams.get('limit')
  if (raw === null) return defaultLimit
  if (!/^\d{1,4}$/.test(raw) || Number(raw)<1 || Number(raw)>1000) {
    throw new Error('limit: must be between 1 and 1000')
  }
  return Number(raw)
}
export function parseGatewaySpendLimit317(value) {
  if (!value || typeof value!=='object' || Array.isArray(value) ||
    !VALID_SCOPES.has(value.scope?.type)) {
    throw new Error('scope: expected organization, user, or rbac_group')
  }
  const scope = value.scope
  if (scope.type === 'user' && (typeof scope.user_id!=='string'||!scope.user_id.trim())) {
    throw new Error('scope.user_id is required')
  }
  if (scope.type === 'rbac_group' && (typeof scope.rbac_group_id!=='string'||!scope.rbac_group_id.trim())) {
    throw new Error('scope.rbac_group_id is required')
  }
  const period=value.period
  if (!VALID_PERIODS.has(period)) throw new Error('period must be daily, weekly, or monthly')
  if (value.currency !== undefined && value.currency!=='USD') throw new Error('currency must be USD')
  const cents = candidate => candidate===null || (typeof candidate==='string'&&/^\d{1,18}$/.test(candidate))
  if (value.amount===undefined && value.pooled_budget===undefined) throw new Error('amount: Required')
  if (value.amount!==undefined && !cents(value.amount)) throw new Error('amount must be a decimal string of cents or null')
  const budget=value.pooled_budget
  if (budget!==undefined && budget!==null) {
    if(typeof budget!=='object'||Array.isArray(budget)) throw new Error('pooled_budget must be an object or null')
    if(budget.amount!==undefined && !cents(budget.amount)) throw new Error('pooled_budget.amount must be a decimal string of cents')
    if(budget.paused!==undefined && budget.paused!==null && typeof budget.paused!=='boolean') {
      throw new Error('pooled_budget.paused must be a boolean')
    }
    if(budget.currency!==undefined && budget.currency!=='USD') throw new Error('pooled_budget.currency must be USD')
    if((budget.paused===false||budget.amount!==undefined&&budget.amount!==null) &&
      (scope.type!=='rbac_group'||period!=='monthly')) {
      throw new Error('Pooled budgets are monthly and apply only to rbac_group')
    }
  }
  return {scope,period,...value}
}

/**
 * Admin routes are authenticated before passing to regular user JWT handling.
 * Returning null means the path belongs to inference or the device flow.
 */
export async function handleGatewayAdmin317(request, context) {
  const url = new URL(request.url)
  if (!isGatewayAdminPath317(url.pathname)) return null
  const requestId='req_'+randomUUID().replaceAll('-','')
  const {config, publicUrl, spend} = context
  const auth=identifyGatewayAdmin317(request,config,publicUrl)
  if (!auth) return apiError(401,'missing or invalid admin credentials',requestId)
  const verb=request.method, base=GATEWAY_SPEND_BASE_317
  const action = async () => {
    if (url.pathname===base+'/effective' && verb==='GET') {
      const principal=url.searchParams.get('user_id')
      if (!principal) return apiError(400,'user_id is required',requestId)
      const groups=url.searchParams.getAll('group')
      const limits=await spend.getApplicableCaps({sub:principal,groups})
      const byPeriod=[]
      for(const period of ['daily','weekly','monthly']) {
        const periodCaps=limits.filter(x=>x.period===period)
        const candidates=periodCaps.filter(x=>x.amount!==null)
        const ordered=candidates.sort((a,b)=>BigInt(a.amount)<BigInt(b.amount)?-1:BigInt(a.amount)>BigInt(b.amount)?1:0)
        const matched=config.admin.group_limit_mode==='max'?ordered.at(-1):ordered[0]
        const used=await spend.getSpend(principal,spendPeriodStart317(period))
        byPeriod.push({type:'effective_limit',scope:{type:'user',user_id:principal},
          period,amount:matched?.amount??null,source:matched?.scope??null,
          spend_limit_id:matched?.id??null,
          period_to_date_spend:String(used),currency:'USD'})
      }
      return Response.json({data:byPeriod,has_more:false})
    }
    if (url.pathname===base+'/audit' && verb==='GET') {
      return Response.json(await spend.listAudit({
        limit:queryLimit(url,100),afterId:url.searchParams.get('after_id')??undefined,
      }))
    }
    if (url.pathname===GATEWAY_COST_PATH_317 && verb==='GET') {
      const principal=url.searchParams.get('user_id')
      if (!principal) return apiError(400,'user_id is required',requestId)
      const period=url.searchParams.get('period')??'monthly'
      if (!VALID_PERIODS.has(period)) return apiError(400,'invalid period',requestId)
      const bucket=spendPeriodStart317(period)
      const cents=await spend.getSpend(principal,bucket)
      return Response.json({data:[{user_id:principal,amount:String(cents),currency:'USD',period:bucket}],has_more:false})
    }
    if (url.pathname===base) {
      if (verb==='GET') {
        const scopeType=url.searchParams.get('scope_type')??undefined
        return Response.json(await spend.list({
          scopeType,limit:queryLimit(url),
          afterId:url.searchParams.get('after_id')??undefined,
          beforeId:url.searchParams.get('before_id')??undefined,
        }))
      }
      if (verb==='POST') {
        if (!auth.canWrite) return apiError(403,'requires write:spend_limits',requestId)
        let body
        try {body=await request.json()}catch{return apiError(400,'invalid JSON body',requestId)}
        const parsed=parseGatewaySpendLimit317(body)
        return Response.json(await spend.upsert(parsed,auth.actor))
      }
    }
    if (url.pathname.startsWith(base+'/')) {
      let id
      try{id=decodeURIComponent(url.pathname.slice(base.length+1))}
      catch{return apiError(400,'malformed spend limit id',requestId)}
      if (!/^spl_[a-fA-F0-9]{32}$/.test(id)) return apiError(404,'spend limit not found',requestId)
      if (verb==='GET') {
        const row=await spend.read(id)
        return row?Response.json(row):apiError(404,'spend limit not found',requestId)
      }
      if (verb==='DELETE') {
        if (!auth.canWrite) return apiError(403,'requires write:spend_limits',requestId)
        const removed=await spend.delete(id,auth.actor)
        return removed?Response.json({type:'spend_limit_deleted',id}):
          apiError(404,'spend limit not found',requestId)
      }
    }
    return apiError(404,'not found',requestId)
  }
  try {
    const response=await action()
    const headers=new Headers(response.headers)
    headers.set('request-id',requestId)
    headers.set('cache-control','no-store')
    return new Response(response.body,{status:response.status,headers})
  } catch(error) {
    if(error instanceof Error &&
      /required|invalid|limit|cursor|scope|period|amount|Pooled|Duplicate/.test(error.message)) {
      return apiError(400,error.message,requestId)
    }
    await context.audit('admin.failure',auth.actor,requestId,{route:url.pathname})
    return apiError(500,'admin store request failed',requestId)
  }
}
