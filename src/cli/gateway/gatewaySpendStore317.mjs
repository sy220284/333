/**
 * Durable PostgreSQL spend limits, usage accounting, group pools and audit.
 * This is the data authority for the enterprise admin API and request wall;
 * mutations run in SQL transactions, with a scope/period advisory lock.
 */
import { randomUUID } from 'node:crypto'

const LIMIT = 1000
const SCOPES = new Set(['organization','user','rbac_group'])
const PERIODS = new Set(['daily','weekly','monthly'])
export const toCents317 = value => {
  if (value === null) return null
  if (typeof value !== 'string' || !/^\d{1,18}$/.test(value)) {
    throw new Error('amount must be a decimal string of cents (1–18 digits), or null')
  }
  return BigInt(value).toString()
}
export function spendPeriodStart317(period, at = new Date()) {
  if (!PERIODS.has(period)) throw new Error('Invalid spend period: '+period)
  const time = new Date(at)
  if (period === 'monthly') return time.toISOString().slice(0,7)
  if (period === 'daily') return time.toISOString().slice(0,10)
  // The native gateway keys weekly spend by ISO week year and number.
  const thursday = new Date(Date.UTC(
    time.getUTCFullYear(),time.getUTCMonth(),time.getUTCDate()))
  const weekday=thursday.getUTCDay() || 7
  thursday.setUTCDate(thursday.getUTCDate()+4-weekday)
  const year=thursday.getUTCFullYear()
  const first=Date.UTC(year,0,1)
  const week=Math.ceil(((thursday.getTime()-first)/86400000+1)/7)
  return year+'-W'+String(week).padStart(2,'0')
}
export function spendPeriodReset317(period, at = new Date()) {
  const current = new Date(at)
  const year=current.getUTCFullYear(),month=current.getUTCMonth(),day=current.getUTCDate()
  if (period==='monthly') return new Date(Date.UTC(year,month+1,1))
  if (period==='daily') return new Date(Date.UTC(year,month,day+1))
  return new Date(Date.UTC(year,month,day+8-(current.getUTCDay()||7)))
}
function rowLimit(row) {
  if (!row) return null
  return {
    type:'spend_limit', id:row.id,
    scope: row.scope_type === 'organization'
      ? {type:'organization'}
      : row.scope_type === 'user'
        ? {type:'user',user_id:row.scope_id}
        : {type:'rbac_group',rbac_group_id:row.scope_id},
    amount:row.amount === null ? null : String(row.amount),
    period:row.period, currency:'USD',
    ...(row.scope_type === 'rbac_group' && row.period==='monthly'
      ? {pooled_budget:row.pooled_monthly_credit_limit === null ? null : {
          amount:String(row.pooled_monthly_credit_limit),
          paused:!row.pooled_limit_enabled, currency:'USD',
          period_to_date_spend:'0',
        }} : {}),
    created_at:new Date(row.created_at).toISOString(),
    updated_at:new Date(row.updated_at).toISOString(),
  }
}
const keyOf = (scope,period) => {
  if (!SCOPES.has(scope?.type) || !PERIODS.has(period)) {
    throw new Error('Invalid spend scope or period')
  }
  if (scope.type==='organization') return {type:scope.type,id:''}
  const id = scope.type==='user'?scope.user_id:scope.rbac_group_id
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Spend scope requires a nonempty user/group identifier')
  }
  return {type:scope.type,id}
}
export async function createGatewaySpendStore317(sql) {
  if (!sql || typeof sql.begin !== 'function') throw new Error('Gateway spend engine requires durable PostgreSQL')
  await sql`
    CREATE TABLE IF NOT EXISTS spend_limits (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('user','rbac_group','organization')),
      scope_id TEXT NOT NULL DEFAULT '',
      amount BIGINT,
      period TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly')),
      currency TEXT NOT NULL DEFAULT 'USD',
      pooled_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      pooled_monthly_credit_limit BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      UNIQUE (scope_type,scope_id,period)
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS spend (
      principal TEXT NOT NULL, period TEXT NOT NULL,
      cents DOUBLE PRECISION NOT NULL DEFAULT 0,
      PRIMARY KEY (principal,period)
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS pooled_spend (
      rbac_group_id TEXT NOT NULL, period TEXT NOT NULL,
      cents BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (rbac_group_id,period)
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT,
      before JSONB, after JSONB, reason TEXT
    )`
  async function audit(tx, item) {
    await tx`INSERT INTO admin_audit(actor,action,target,before,after,reason)
       VALUES(${item.actor},${item.action},${item.target??null},
         ${item.before===undefined?null:JSON.stringify(item.before)}::jsonb,
         ${item.after===undefined?null:JSON.stringify(item.after)}::jsonb,
         ${item.reason??null})`
  }
  const columns = 'id,scope_type,scope_id,amount,period,currency,pooled_limit_enabled,pooled_monthly_credit_limit,created_at,updated_at'
  return {
    async read(id) {
      const rows=await sql`SELECT * FROM spend_limits WHERE id=${id}`
      return rowLimit(rows[0])
    },
    async list({scopeType,limit=20,afterId,beforeId}={}) {
      if (!Number.isInteger(limit)||limit<1||limit>LIMIT) throw new Error('limit must be 1–1000')
      if (afterId && beforeId) throw new Error('after_id and before_id are mutually exclusive')
      if (scopeType && !SCOPES.has(scopeType)) throw new Error('scope_type invalid')
      let all=await sql`SELECT * FROM spend_limits
        WHERE (${scopeType??null}::text IS NULL OR scope_type=${scopeType??null})
        ORDER BY created_at, id`
      if (afterId||beforeId) {
        const cursor=all.findIndex(r=>r.id===(afterId??beforeId))
        if (cursor<0) throw new Error('spend limit cursor not found')
        all=afterId?all.slice(cursor+1):all.slice(0,cursor)
      }
      const data=beforeId?all.slice(-limit):all.slice(0,limit)
      return {
        data:data.map(rowLimit), has_more:all.length>limit,
        first_id:data[0]?.id??null,last_id:data.at(-1)?.id??null,
      }
    },
    async upsert(body,actor) {
      const {type,id}=keyOf(body.scope,body.period)
      const amount=body.amount===undefined?undefined:toCents317(body.amount)
      const pool=body.pooled_budget
      if(pool!==undefined&&pool!==null&&(type!=='rbac_group'||body.period!=='monthly')) {
        throw new Error('Pooled budgets are monthly and apply only to rbac_group')
      }
      const poolAmount=pool?.amount===undefined?undefined:toCents317(pool.amount)
      const poolPaused=pool?.paused
      if(poolPaused!==undefined&&poolPaused!==null&&typeof poolPaused!=='boolean') {
        throw new Error('pooled_budget.paused must be a boolean')
      }
      return sql.begin(async tx=>{
        await tx`SELECT pg_advisory_xact_lock(hashtext(${type+':'+id+':'+body.period}))`
        const existing=(await tx`SELECT * FROM spend_limits
          WHERE scope_type=${type} AND scope_id=${id} AND period=${body.period}
          FOR UPDATE`)[0]
        const finalAmount=amount===undefined
          ? existing?.amount===null?null:existing?.amount===undefined?undefined:String(existing.amount)
          : amount
        if(finalAmount===undefined) throw new Error('amount is required to create a spend limit')
        const finalPool=poolAmount===undefined
          ? existing?.pooled_monthly_credit_limit===null?null:
            existing?.pooled_monthly_credit_limit===undefined?null:String(existing.pooled_monthly_credit_limit)
          : poolAmount
        const enabled=poolPaused===undefined||poolPaused===null
          ? existing?Boolean(existing.pooled_limit_enabled):finalPool!==null
          : !poolPaused
        if(enabled&&finalPool===null) throw new Error('An active pooled budget requires an amount')
        if(enabled&&finalAmount===null) throw new Error('An active pooled budget requires per-user amount')
        const newId=existing?.id??'spl_'+randomUUID().replaceAll('-','')
        const rows=await tx`INSERT INTO spend_limits (
          id,scope_type,scope_id,amount,period,pooled_limit_enabled,
          pooled_monthly_credit_limit,created_by
        ) VALUES (${newId},${type},${id},${finalAmount},${body.period},
          ${enabled},${finalPool},${actor})
        ON CONFLICT(scope_type,scope_id,period) DO UPDATE SET
          amount=EXCLUDED.amount,
          pooled_limit_enabled=EXCLUDED.pooled_limit_enabled,
          pooled_monthly_credit_limit=EXCLUDED.pooled_monthly_credit_limit,
          updated_at=NOW()
        RETURNING *`
        const next=rowLimit(rows[0])
        await audit(tx,{actor,action:'spend_limit.upsert',
          target:next.id,before:rowLimit(existing),after:next})
        return next
      })
    },
    async delete(id,actor) {
      return sql.begin(async tx=>{
        const rows=await tx`DELETE FROM spend_limits WHERE id=${id} RETURNING *`
        if(!rows.length) return false
        await audit(tx,{actor,action:'spend_limit.delete',target:id,before:rowLimit(rows[0])})
        return true
      })
    },
    async listAudit({limit=100,afterId}={}) {
      if(!Number.isInteger(limit)||limit<1||limit>LIMIT) throw new Error('limit must be 1–1000')
      if(afterId!==undefined&&(!/^\d{1,18}$/.test(String(afterId)))) {
        throw new Error('after_id must be an audit event id')
      }
      const rows=await sql`SELECT id,at,actor,action,target,before,after,reason
        FROM admin_audit
        WHERE (${afterId??null}::bigint IS NULL OR id<${afterId??null}::bigint)
        ORDER BY id DESC LIMIT ${limit+1}`
      return {data:rows.slice(0,limit).map(row=>({
        type:'audit_event',id:String(row.id),created_at:new Date(row.at).toISOString(),
        actor:row.actor,action:row.action,target_id:row.target,
        before:row.before??null,after:row.after??null,reason:row.reason??null,
      })),has_more:rows.length>limit}
    },
    async getApplicableCaps(identity) {
      const groups=Array.isArray(identity.groups)?identity.groups:[]
      const rows=await sql`SELECT * FROM spend_limits
        WHERE (scope_type='organization')
          OR (scope_type='user' AND scope_id=${identity.sub})
          OR (scope_type='rbac_group' AND scope_id=ANY(${sql.array(groups,'TEXT')}))`
      return rows.map(rowLimit)
    },
    async getSpend(principal,period) {
      const rows=await sql`SELECT cents FROM spend WHERE principal=${principal} AND period=${period}`
      return rows.length?Number(rows[0].cents):0
    },
    async getPoolSpend(group,period) {
      const rows=await sql`SELECT cents FROM pooled_spend WHERE rbac_group_id=${group} AND period=${period}`
      return rows.length?BigInt(rows[0].cents):0n
    },
    async addSpend(identity,cents,now=new Date(),payingGroup=null) {
      const delta=Number(cents)
      if(!Number.isFinite(delta)||delta<0) throw new Error('spent amount must be a finite nonnegative number of cents')
      if(delta===0) return
      const groups=Array.isArray(identity.groups)?identity.groups:[]
      const periods=['daily','weekly','monthly']
      await sql.begin(async tx=>{
        for(const period of periods) {
          const bucket=spendPeriodStart317(period,now)
          await tx`INSERT INTO spend(principal,period,cents)
            VALUES(${identity.sub},${bucket},${delta})
            ON CONFLICT(principal,period) DO UPDATE SET cents=spend.cents+EXCLUDED.cents`
        }
        const monthly=spendPeriodStart317('monthly',now)
        // The original spend meter attributes each inference to one
        // paying group. Deducting from all groups would charge the same
        // request multiple times and prematurely exhaust shared budgets.
        if (payingGroup !== null) {
          if (!groups.includes(payingGroup)) throw new Error('Paying group must belong to the authenticated identity')
          await tx`INSERT INTO pooled_spend(rbac_group_id,period,cents)
            VALUES(${payingGroup},${monthly},${delta})
            ON CONFLICT(rbac_group_id,period) DO UPDATE SET cents=pooled_spend.cents+EXCLUDED.cents`
        }
      })
    },
  }
}
