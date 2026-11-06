/**
 * Claude Code 2.1.317 self-hosted runner operator API.
 * Source: chunk-qefetax7.js (WHe) and chunk-0fymexev.js.
 * 管理凭据由操作员显式配置，和模型账号 OAuth 分离。
 */
import { resolveRunnerEndpoint } from './endpointPolicy.ts'
import {readFile,open,stat} from 'node:fs/promises'
import {resolve} from 'node:path'

export const RUNNER_ADMIN_PREFIX_317='/v1/code/runners/self-hosted'
export const RUNNER_OPERATOR_UI_317='用户自托管 Runner 服务 → 管理与状态接口'
const ID=/^[a-zA-Z0-9_-]{1,256}$/
export function runnerAdminId317(name:string,value:string):string{
  if(!ID.test(value))throw Error('Invalid '+name+'; use a tagged ID without spaces')
  return value
}
function adminPath317(path:string):string{
  if(!path.startsWith(RUNNER_ADMIN_PREFIX_317+'/'))throw Error('Invalid Runner API path')
  return path
}
type RunnerRequest317={method:'GET'|'POST';path:string;body?:unknown;signal?:AbortSignal}
export type RunnerAdminDeps317={
  baseUrl?:string
  fetchImpl?:typeof fetch
  credentials?:()=>Promise<{accessToken:string}>
}
export async function runnerAdminRequest317(
  request:RunnerRequest317,deps:RunnerAdminDeps317={}
):Promise<Record<string,unknown>>{
  const base=resolveRunnerEndpoint(deps.baseUrl ?? process.env.SELF_HOSTED_RUNNER_API_URL)
  const accessToken=deps.credentials
    ? (await deps.credentials()).accessToken
    : process.env.SELF_HOSTED_RUNNER_ADMIN_TOKEN?.trim()
  if(!accessToken)throw Error('Runner 管理需要显式设置 SELF_HOSTED_RUNNER_ADMIN_TOKEN')
  const response=await (deps.fetchImpl??fetch)(base+adminPath317(request.path),{
    method:request.method,
    redirect:'error',
    headers:{'Authorization':'Bearer '+accessToken,
      'anthropic-version':'2023-06-01','content-type':'application/json'},
    ...(request.body===undefined?{}:{body:JSON.stringify(request.body)}),
    signal:request.signal??AbortSignal.timeout(20_000),
  })
  let result:unknown=null
  if(response.status!==204){
    const raw=await response.text()
    try{result=raw?JSON.parse(raw):null}
    catch{throw Error('Runner API returned invalid JSON: HTTP '+response.status)}
  }
  if(!response.ok){
    let message=JSON.stringify(result)
    if(result&&typeof result==='object'&&'error' in result){
      const error=(result as Record<string,unknown>).error
      if(error&&typeof error==='object'&&'message' in error)
        message=String((error as Record<string,unknown>).message)
    }
    throw Error('Runner API HTTP '+response.status+' '+request.method+' '+request.path+': '+message)
  }
  if(result===null)return {}
  if(typeof result!=='object'||Array.isArray(result))
    throw Error('Runner API returned unexpected payload')
  return result as Record<string,unknown>
}
export function operatorUi317(area:'pool'|'runners'|'sessions'|'secrets'):string{
  return RUNNER_OPERATOR_UI_317+' → (environment) → '+({
    pool:'header stat tiles',runners:'Activity → Runners',
    sessions:'Activity → Sessions',secrets:'Configuration → Environment keys'
  } as const)[area]
}
export async function getRunnerPool317(
  poolId:string,deps:RunnerAdminDeps317={},signal?:AbortSignal
){
  const id=runnerAdminId317('pool_id',poolId)
  const data=await runnerAdminRequest317({
    method:'GET',path:RUNNER_ADMIN_PREFIX_317+'/pools/'+encodeURIComponent(id),signal
  },deps)
  return {pool:data.pool??data,equivalent:{ui:operatorUi317('pool')}}
}
export async function listRunnerSessions317(
  poolId:string,statusFilter?:string,deps:RunnerAdminDeps317={},signal?:AbortSignal
){
  const id=runnerAdminId317('pool_id',poolId)
  if(statusFilter!==undefined&&/[\x00-\x1f\x7f]/.test(statusFilter))
    throw Error('status_filter contains controls')
  const query=statusFilter?'?status='+encodeURIComponent(statusFilter):''
  const data=await runnerAdminRequest317({
    method:'GET',path:RUNNER_ADMIN_PREFIX_317+'/pools/'+encodeURIComponent(id)+'/sessions'+query,signal
  },deps)
  return {sessions:Array.isArray(data.sessions)?data.sessions:[],equivalent:{ui:operatorUi317('sessions')}}
}
export async function listRunnerMachines317(
  poolId:string,deps:RunnerAdminDeps317={},signal?:AbortSignal
){
  const id=runnerAdminId317('pool_id',poolId)
  const data=await runnerAdminRequest317({
    method:'GET',path:RUNNER_ADMIN_PREFIX_317+'/runners?pool_id='+encodeURIComponent(id),signal
  },deps)
  return {runners:Array.isArray(data.runners)?data.runners:[],equivalent:{ui:operatorUi317('runners')}}
}
export async function listRunnerSecrets317(
  poolId:string,deps:RunnerAdminDeps317={},signal?:AbortSignal
){
  const id=runnerAdminId317('pool_id',poolId)
  const data=await runnerAdminRequest317({
    method:'GET',path:RUNNER_ADMIN_PREFIX_317+'/pools/'+encodeURIComponent(id)+'/secrets',signal
  },deps)
  return {secrets:Array.isArray(data.secrets)?data.secrets:[],equivalent:{ui:operatorUi317('secrets')}}
}
export async function requeueRunnerSession317(
  sessionId:string,runnerId:string,deps:RunnerAdminDeps317={},signal?:AbortSignal
){
  const session=runnerAdminId317('session_id',sessionId)
  const runner=runnerAdminId317('runner_id',runnerId)
  const data=await runnerAdminRequest317({
    method:'POST',path:RUNNER_ADMIN_PREFIX_317+'/sessions/'+encodeURIComponent(session)+'/requeue',
    body:{runner_id:runner},signal
  },deps)
  return {excluded_count:data.excluded_count??0,equivalent:{ui:operatorUi317('sessions')}}
}
export async function probeRunnerLocal317(kind:'healthz'|'metrics',port=8080,fetchImpl:typeof fetch=fetch){
  if(port===0)return {disabled:true}
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid local health port')
  try{
    const response=await fetchImpl('http://127.0.0.1:'+port+'/'+kind,{
      signal:AbortSignal.timeout(2_000)
    })
    const raw=await response.text()
    if(!response.ok)throw Error('HTTP '+response.status+' '+raw.slice(0,200))
    if(kind==='metrics'){
      const gauges:Record<string,number>={}
      for(const line of raw.split('\n')){
        const hit=line.match(/^claude_code_self_hosted_runner_([^\s{]+)(?:\{[^}]*\})?\s+(\S+)/)
        if(!hit)continue
        const name=hit[1]!,value=Number(hit[2])
        if(name.endsWith('_bucket')||name==='session_idle_seconds'||name==='poll_errors_total'||!Number.isFinite(value))continue
        gauges[name]=(gauges[name]??0)+value
      }
      return {gauges,raw}
    }
    const health:unknown=JSON.parse(raw)
    if(!health||typeof health!=='object'||Array.isArray(health))throw Error('Invalid health JSON')
    return {health}
  }catch(error){
    return {unreachable:true,error:error instanceof Error?error.message:String(error)}
  }
}
export async function tailRunnerLog317(file:string,limit=65536){
  if(!Number.isInteger(limit)||limit<1||limit>1000000)throw Error('Invalid tail byte count')
  const handle=await open(resolve(file),'r')
  try{
    const stats=await handle.stat()
    if(!stats.isFile())throw Error('Runner log must be a regular file')
    const bytesRead=Math.min(stats.size,limit)
    const data=Buffer.alloc(bytesRead)
    await handle.read(data,0,bytesRead,stats.size-bytesRead)
    const redacted=data.toString('utf8')
      .replace(/(Bearer\s+)[^\s]+/gi,'$1<redacted>')
      .replace(/((?:ANTHROPIC_API_KEY|SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET|SELF_HOSTED_RUNNER_POOL_SECRET|CLAUDE_CODE_SESSION_ACCESS_TOKEN)\s*[:=]\s*)[^\s]+/gi,'$1<redacted>')
      .replace(/sk-ant-[\w-]+/g,'<redacted>')
    return {lines:redacted,bytes_read:bytesRead}
  }finally{await handle.close()}
}
