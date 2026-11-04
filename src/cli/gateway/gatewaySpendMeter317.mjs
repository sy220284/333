/**
 * Native 2.1.317 spend limits: user > RBAC group > organization,
 * monthly pooled groups, model token accounting and streaming SSE usage.
 */
import { randomUUID } from 'node:crypto'
import { spendPeriodStart317, spendPeriodReset317 } from './gatewaySpendStore317.mjs'

const FALLBACK = Object.freeze({
  input:5,output:25,cache_read:.5,cache_write:6.25,cache_write_1h:10,
  web_search:.01,
})
const OPUS_HIGH = Object.freeze({input:30,output:150,cache_read:3,
  cache_write:37.5,cache_write_1h:60,web_search:.01})
const OPUS_MID = Object.freeze({input:10,output:50,cache_read:1,
  cache_write:12.5,cache_write_1h:20,web_search:.01})
const OPUS_55 = Object.freeze({input:8,output:40,cache_read:.4,
  cache_write:10,cache_write_1h:16,web_search:.01})

function modelPrices(model,config,upstream) {
  const override=(config.pricing?.overrides??[]).find(x=>
    x.upstream===upstream && x.model.toLowerCase()===model.toLowerCase())
  if (override) return {...FALLBACK,...override}
  if (/claude-opus-5-5/i.test(model)) return OPUS_55
  if (/claude-opus-(4-8|5)(?![-\d])/i.test(model)) return OPUS_MID
  if (/claude-opus/i.test(model)) return OPUS_HIGH
  return FALLBACK
}
export function centsForGatewayUsage317(usage,model,config={},upstream) {
  const rate=modelPrices(model,config,upstream)
  const read=Number(usage?.cache_read_input_tokens??0)
  const write=Number(usage?.cache_creation_input_tokens??0)
  const oneHour=Math.min(write,Number(usage?.cache_creation?.ephemeral_1h_input_tokens??0))
  const input=Number(usage?.input_tokens??0)
  const output=Number(usage?.output_tokens??0)
  const searches=Number(usage?.server_tool_use?.web_search_requests??0)
  const values=[read,write,oneHour,input,output,searches]
  if(values.some(x=>!Number.isFinite(x)||x<0)) throw new Error('Invalid metered model token counts')
  const usd=(input*rate.input+output*rate.output+read*rate.cache_read+
    (write-oneHour)*rate.cache_write+oneHour*rate.cache_write_1h)/1e6+
    searches*rate.web_search
  const multiplier=Number(config.pricing?.multiplier??1)
  if(!Number.isFinite(multiplier)||multiplier<=0||multiplier>10) {
    throw new Error('Gateway pricing.multiplier must be >0 and <=10')
  }
  return usd*100*multiplier
}
function selectCap(caps,period,mode) {
  const matches=caps.filter(x=>x.period===period)
  if(!matches.length) return null
  const priority={user:0,rbac_group:1,organization:2}
  const sorted=[...matches].sort((a,b)=>{
    const type=priority[a.scope?.type]-priority[b.scope?.type]
    if(type!==0) return type
    const aNull=a.amount===null,bNull=b.amount===null
    if(aNull!==bNull) return mode==='min'?(aNull?1:-1):(aNull?-1:1)
    if(a.amount!==null && b.amount!==null) {
      const delta=BigInt(a.amount)-BigInt(b.amount)
      if(delta!==0n) return mode==='max'?(delta<0n?1:-1):(delta<0n?-1:1)
    }
    return String(a.id).localeCompare(String(b.id))
  })
  return sorted[0]
}
const currentPeriodRows=async (store,identity,mode,now)=>{
  const caps=await store.getApplicableCaps(identity)
  const result=[]
  for(const period of ['daily','weekly','monthly']) {
    const cap=selectCap(caps,period,mode)
    if(!cap || cap.amount===null) continue
    const spent=await store.getSpend(identity.sub,spendPeriodStart317(period,now))
    const limit=Number(cap.amount)
    const reset=spendPeriodReset317(period,now)
    result.push({...cap,spent,limit,reset,utilization:limit>0?spent/limit:1,
      exceeded:spent>=limit,scope_type:cap.scope.type})
  }
  return result
}
function priorityBinding(rows) {
  return rows.sort((a,b)=>Number(b.exceeded)-Number(a.exceeded)||
    b.utilization-a.utilization||b.reset.getTime()-a.reset.getTime())[0]
}
export function unifiedSpendHeaders317(binding,now=new Date()) {
  if(!binding) return {}
  const blocked=binding.exceeded
  const utilization=blocked?binding.utilization:Math.min(.99,Math.round(binding.utilization*100)/100)
  const headers={
    'anthropic-ratelimit-unified-status':blocked?'rejected':
      binding.utilization>.75?'allowed_warning':'allowed',
    'anthropic-ratelimit-unified-reset':String(Math.floor(binding.reset.getTime()/1000)),
    'anthropic-ratelimit-unified-overage-reset':String(Math.floor(binding.reset.getTime()/1000)),
    'anthropic-ratelimit-unified-overage-utilization':String(utilization),
  }
  if(blocked){
    headers['anthropic-ratelimit-unified-overage-period']=binding.period
    if(binding.scope_type==='group_pool') headers['anthropic-ratelimit-unified-overage-scope']='group_pool'
    headers['anthropic-ratelimit-unified-overage-disabled-reason']='org_spend_cap_reached'
    headers['retry-after']=String(Math.max(1,Math.ceil((binding.reset.getTime()-now.getTime())/1000)))
  }else{
    headers['anthropic-ratelimit-unified-representative-claim']='overage'
    headers['anthropic-ratelimit-unified-overage-status']=headers['anthropic-ratelimit-unified-status']
    if(binding.utilization>.75) {
      headers['anthropic-ratelimit-unified-overage-surpassed-threshold']=
        String(binding.utilization>.95?.95:.75)
    }
  }
  return headers
}
function denySpend317(binding,headers,requestId,now=new Date()) {
  return Response.json({type:'error',error:{
    type:'billing_error',
    message:binding?
      'spend limit reached ('+binding.period+'; resets '+binding.reset.toISOString()+')':
      'spend limit unavailable',
  }},{status:429,headers:{
    ...headers,'x-request-id':requestId,'cache-control':'no-store',
  }})
}
export async function precheckGatewaySpend317(store,identity,config,now=new Date()) {
  if(!config.admin) return {blocked:null,headers:{},payingGroup:null}
  const requestId='req_'+randomUUID().replaceAll('-','')
  const mode=config.admin.group_limit_mode??'min'
  let caps
  try {caps=await currentPeriodRows(store,identity,mode,now)}
  catch(error) {
    if(config.enforcement?.fail_closed_on_error) return {
      blocked:denySpend317(null,{'anthropic-ratelimit-unified-overage-disabled-reason':'fetch_error'},requestId),
      headers:{},payingGroup:null,
    }
    // Native default fail-open: preserve inference while a database check
    // fails. The request path still records a diagnostic audit.
    return {blocked:null,headers:{},payingGroup:null,checkError:error}
  }
  const selected=priorityBinding(caps)
  const headers=unifiedSpendHeaders317(selected,now)
  if(selected?.exceeded) return {
    blocked:denySpend317(selected,headers,requestId,now),
    headers,payingGroup:null,
  }
  const eligible=[]
  for(const group of new Set(identity.groups??[])) {
    const poolCaps=await store.getApplicableCaps({sub:identity.sub,groups:[group]})
    const pool=poolCaps.find(row=>row.scope.type==='rbac_group'&&
      row.scope.rbac_group_id===group&&row.period==='monthly'&&
      row.pooled_budget&&!row.pooled_budget.paused)
    if(!pool)continue
    const limit=Number(pool.pooled_budget.amount)
    const spent=await store.getPoolSpend(group,spendPeriodStart317('monthly',now))
    eligible.push({group,limit,spent})
  }
  eligible.sort((a,b)=>b.limit-a.limit||a.group.localeCompare(b.group))
  if(eligible.length && !eligible.some(p=>p.spent<p.limit)) {
    const row=eligible[0]
    const groupCap={
      period:'monthly',spent:row.spent,limit:row.limit,
      exceeded:true,utilization:row.limit>0?row.spent/row.limit:1,
      reset:spendPeriodReset317('monthly',now),scope_type:'group_pool',
    }
    const poolHeaders=unifiedSpendHeaders317(groupCap,now)
    return {blocked:denySpend317(groupCap,poolHeaders,requestId,now),
      headers:poolHeaders,payingGroup:null}
  }
  return {blocked:null,headers,payingGroup:
    eligible.find(p=>p.spent<p.limit)?.group??null,caps}
}
export function createGatewaySseUsage317() {
  let buffer='', usage={}, seen=false
  const decoder=new TextDecoder()
  const consume=(frame)=>{
    const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:'))
      .map(line=>line.slice(5).trim()).join('\n')
    if(!data || data==='[DONE]')return
    let event;try{event=JSON.parse(data)}catch{return}
    if(event.type==='message_start'&&event.message?.usage) {
      usage={...usage,...event.message.usage}
      seen=true
    }
    if(event.type==='message_delta'&&event.usage) {
      for(const [key,val] of Object.entries(event.usage)) {
        if(typeof val==='number')usage[key]=Math.max(usage[key]??0,val)
        else if(val&&typeof val==='object')usage[key]={...(usage[key]??{}),...val}
      }
      seen=true
    }
    if(event.type==='content_block_delta'&&
      (event.delta?.text || event.delta?.partial_json || event.delta?.thinking)) {
      const text=String(event.delta.text??event.delta.partial_json??event.delta.thinking)
      usage._estimated_output_chars=(usage._estimated_output_chars??0)+text.length
    }
  }
  return {
    push(bytes) {
      buffer+=decoder.decode(bytes,{stream:true})
      // Upstreams may use LF or CRLF, and a frame boundary can split
      // across TCP chunks; preserve incomplete frames for the next pull.
      let delimiter
      while((delimiter=/\r?\n\r?\n/.exec(buffer))!==null) {
        consume(buffer.slice(0,delimiter.index))
        buffer=buffer.slice(delimiter.index+delimiter[0].length)
      }
    },
    finish() {
      buffer+=decoder.decode()
      if(buffer.trim())consume(buffer)
      if(!seen&&!(usage._estimated_output_chars>0))return null
      if(usage.output_tokens===undefined&&usage._estimated_output_chars>0) {
        usage.output_tokens=Math.ceil(usage._estimated_output_chars/4)
      }
      const {_estimated_output_chars,...rest}=usage
      return rest
    },
  }
}
/** Preserve raw SSE while recording tokens as the client consumes them. */
export function meterGatewayResponse317(response,context) {
  const {store,identity,config,model,upstream,payingGroup,headers={},audit}=context
  const h=new Headers(response.headers)
  for(const [key,value] of Object.entries(headers))h.set(key,value)
  if(response.status>=400 || !response.body) return new Response(response.body,{
    status:response.status,headers:h,
  })
  const streaming=(h.get('content-type')??'').includes('text/event-stream')
  const reader=response.body.getReader()
  const usage=streaming?createGatewaySseUsage317():null
  const chunks=[]
  const finish=async()=>{
    let metered
    if(streaming) metered=usage.finish()
    else{
      const full=Buffer.concat(chunks)
      try {metered=JSON.parse(full.toString('utf8')).usage}
      catch{metered=null}
    }
    if(!metered)return
    const cents=centsForGatewayUsage317(metered,model,config,upstream)
    if(cents>0) {
      await store.addSpend(identity,cents,new Date(),payingGroup)
      await audit?.('spend.metered',identity.sub,null,{cents,model,upstream,payingGroup})
    }
  }
  const body=new ReadableStream({
    async pull(controller){
      try{
        const chunk=await reader.read()
        if(chunk.done){
          await finish()
          controller.close()
          return
        }
        if(streaming)usage.push(chunk.value)
        else chunks.push(Buffer.from(chunk.value))
        controller.enqueue(chunk.value)
      }catch(error){controller.error(error)}
    },
    async cancel(reason){await reader.cancel(reason)},
  })
  return new Response(body,{status:response.status,headers:h})
}
export async function gatewayUsageResponse317(store,identity,config,now=new Date()) {
  try{
    const caps=await currentPeriodRows(store,identity,config.admin?.group_limit_mode??'min',now)
    const binding=priorityBinding(caps)
    return Response.json({
      ...(binding?{extra_usage:{
        is_enabled:true,monthly_limit:binding.limit,
        used_credits:Math.floor(binding.spent),
        utilization:Math.round(Math.min(1,binding.utilization)*100),
        currency:'USD',
      }}:{}),
      limits:caps.map(row=>({kind:'spend',group:row.period,
        percent:Math.round(Math.min(1,row.utilization)*100),
        resets_at:row.reset.toISOString(),
        severity:row.exceeded||row.utilization>.95?'critical':
          row.utilization>.75?'warning':'normal',
        is_active:row===binding,
      })),
    },{headers:{'cache-control':'no-store'}})
  }catch(error){
    return new Response('spend limit unavailable',{status:503,
      headers:{'cache-control':'no-store'}})
  }
}
