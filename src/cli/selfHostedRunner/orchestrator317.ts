/**
 * 2.1.317 self-hosted orchestrator: spawn-hints protocol and lifecycle.
 * Reference: chunk-sbmjnb3e.js / chunk-mn2j77dt.js in verified x64 binary.
 */
import {readFile,stat,access,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {constants} from 'node:fs'
import {spawn} from 'node:child_process'
import {hostname,tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'

export type SpawnHint317={
  jti?:string; session_uuid:string;attempt:number;work_order_jwt:string;
  sources?:{url?:string;revision?:string}[];correlation_id?:string;client_platform?:string
}
export type SpawnPoll317={hints:SpawnHint317[];warm_hints:SpawnHint317[];
  pending_count:number;backing_off_count:number;circuit_broken_count:number;
  pool_pending_session_count:number;pool_active_session_count:number;
  server_date:string|null}
export type OrchestratorOptions317={
  apiUrl:string;secretFile?:string;hooksDir?:string;healthPort:number;
  hookConcurrency:number;hookTimeoutMs:number;expectedSpawnSeconds:number;
  minIdle:number;shutdownDrainMs:number;logLevel:'info'|'debug';
  agentProxyUrl?:string
}
const DEFAULTS:OrchestratorOptions317={
  apiUrl:'https://api.anthropic.com',healthPort:8080,hookConcurrency:4,
  hookTimeoutMs:60_000,expectedSpawnSeconds:120,minIdle:0,
  shutdownDrainMs:0,logLevel:'info'
}
const API='/v1/code/runners/self-hosted/spawn-hints/'
export function parseOrchestratorArgs317(argv:readonly string[],env:NodeJS.ProcessEnv=process.env):
  OrchestratorOptions317|'help'{
  if(argv.includes('--help')||argv.includes('-h'))return 'help'
  const o:OrchestratorOptions317={...DEFAULTS,
    hooksDir:env.SELF_HOSTED_RUNNER_HOOKS_DIR,
    healthPort:env.SELF_HOSTED_RUNNER_HEALTH_PORT
      ? parseInteger('SELF_HOSTED_RUNNER_HEALTH_PORT',env.SELF_HOSTED_RUNNER_HEALTH_PORT,0,65535):8080,
    agentProxyUrl:env.SELF_HOSTED_RUNNER_AGENT_PROXY_URL}
  for(let i=0;i<argv.length;i++){
    const key=argv[i]!
    const val=argv[++i]
    if(!val||val.startsWith('--'))throw Error('orchestrator: '+key+' requires a value')
    switch(key){
      case '--api-url':o.apiUrl=val;break
      case '--environment-secret-file':case '--pool-secret-file':o.secretFile=val;break
      case '--hooks-dir':o.hooksDir=resolve(val);break
      case '--health-port':o.healthPort=parseInteger(key,val,0,65535);break
      case '--hook-concurrency':o.hookConcurrency=parseInteger(key,val,1,100);break
      case '--hook-timeout':o.hookTimeoutMs=parsePositive(key,val)*1000;break
      case '--expected-spawn-seconds':o.expectedSpawnSeconds=parseInteger(key,val,10,3600);break
      case '--min-idle':o.minIdle=parseInteger(key,val,0,200);break
      case '--shutdown-drain-sec':o.shutdownDrainMs=parseInteger(key,val,0,3600)*1000;break
      case '--log-level':
        if(val!=='info'&&val!=='debug')throw Error('--log-level must be info or debug')
        o.logLevel=val;break
      case '--agent-proxy-url':o.agentProxyUrl=val;break
      default:throw Error('orchestrator: unknown flag '+key)
    }
  }
  if(o.hookTimeoutMs+5000>=o.expectedSpawnSeconds*1000)
    throw Error('--hook-timeout plus SIGKILL grace must be less than --expected-spawn-seconds')
  for(const [name,url] of [['--api-url',o.apiUrl],['--agent-proxy-url',o.agentProxyUrl]]){
    if(url===undefined)continue
    const x=new URL(url)
    if(x.protocol!=='https:'||x.username||x.password||x.search||x.hash)
      throw Error(name+' must be an HTTPS origin without credentials')
  }
  return o
}
function parseInteger(flag:string,value:string,min:number,max:number){
  if(!/^(0|[1-9]\d*)$/.test(value))throw Error(flag+' must be an integer')
  const x=Number(value)
  if(!Number.isSafeInteger(x)||x<min||x>max)throw Error(flag+' must be within ['+min+','+max+']')
  return x
}
function parsePositive(flag:string,value:string){
  const x=Number(value)
  if(!Number.isFinite(x)||x<=0)throw Error(flag+' requires positive seconds')
  return x
}
export function runnerJwtClaims317(token:string):Record<string,unknown>{
  const segments=token.replace(/^sk-ant-[a-z]+-/,'').split('.')
  if(segments.length<2)throw Error('runner secret or work order is not a JWT')
  try{
    const decoded=JSON.parse(Buffer.from(segments[1]!,'base64url').toString('utf8'))
    if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))throw Error('not an object')
    return decoded
  }catch{throw Error('runner JWT claims are unreadable')}
}
export function runnerEnvironmentId317(secret:string):string{
  const pool=runnerJwtClaims317(secret)['ccr:pool_id']
  if(typeof pool!=='string'||!/^[a-zA-Z0-9_-]+$/.test(pool))
    throw Error('environment secret is missing the ccr:pool_id claim')
  return pool
}
export type OrchestratorApi317={
  poll:(body:Record<string,unknown>,signal:AbortSignal)=>Promise<SpawnPoll317>;
  nack:(body:Record<string,unknown>,signal:AbortSignal)=>Promise<void>
}
export function createOrchestratorApi317(
  baseUrl:string,secret:string,fetchImpl:typeof fetch=fetch
):OrchestratorApi317{
  const base=baseUrl.replace(/\/+$/,'')
  async function request(path:string,body:Record<string,unknown>,signal:AbortSignal,ms:number){
    const ctl=new AbortController()
    const timeout=setTimeout(()=>ctl.abort(Error('orchestrator API request timeout')),ms)
    const abort=()=>ctl.abort(signal.reason)
    if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true})
    try{
      const response=await fetchImpl(base+API+path,{
        method:'POST',signal:ctl.signal,
        headers:{'authorization':'Bearer '+secret,'content-type':'application/json',
          'anthropic-version':'2023-06-01','x-self-hosted-runner-version':'2.1.317'},
        body:JSON.stringify(body)})
      const raw=await response.text()
      let data:unknown
      try{data=JSON.parse(raw)}catch{throw Error('Invalid '+path+' response JSON (HTTP '+response.status+')')}
      if(!response.ok)throw Object.assign(Error('spawn-hints/'+path+': HTTP '+response.status+
        ' '+JSON.stringify(data).slice(0,300)),{httpStatus:response.status})
      if(data===null||typeof data!=='object'||Array.isArray(data))throw Error('Malformed '+path+' response')
      return {data:data as Record<string,unknown>,date:response.headers.get('date')}
    }finally{clearTimeout(timeout);signal.removeEventListener('abort',abort)}
  }
  return{
    async poll(body,signal){
      const {data,date}=await request('poll',body,signal,30_000)
      if(!Array.isArray(data.hints)||!Array.isArray(data.warm_hints))throw Error('Malformed PollSpawnHints arrays')
      const parse=(arr:unknown[])=>arr.map((v)=>{
        if(v===null||typeof v!=='object')throw Error('Malformed spawn hint')
        const o=v as Record<string,unknown>
        if(typeof o.work_order_jwt!=='string'||!/^[\w.-]+$/.test(o.work_order_jwt))
          throw Error('Malformed spawn work order')
        return {jti:typeof o.jti==='string'?o.jti:undefined,
          session_uuid:typeof o.session_uuid==='string'?o.session_uuid:'',
          attempt:typeof o.attempt==='number'?o.attempt:0,
          work_order_jwt:o.work_order_jwt,
          sources:Array.isArray(o.sources)?o.sources as SpawnHint317['sources']:[],
          correlation_id:typeof o.correlation_id==='string'?o.correlation_id:undefined,
          client_platform:typeof o.client_platform==='string'?o.client_platform:undefined}
      })
      const count=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?x:0
      return{hints:parse(data.hints),warm_hints:parse(data.warm_hints),
        pending_count:count(data.pending_count),backing_off_count:count(data.backing_off_count),
        circuit_broken_count:count(data.circuit_broken_count),
        pool_pending_session_count:count(data.pool_pending_session_count),
        pool_active_session_count:count(data.pool_active_session_count),server_date:date}
    },
    async nack(body,signal){await request('nack',body,signal,15000)}
  }
}
export type SpawnHookResult317={ok:boolean;exitCode:number|null;timedOut:boolean;
  execError:boolean;stderrTail:string;durationMs:number}
function safeValue317(value:unknown):string{
  if(typeof value!=='string')return ''
  if(/[\x00-\x1f\x7f]/.test(value))throw Error('Unsafe control character in spawn hint')
  return value
}
export function workOrderEnvironment317(hint:SpawnHint317,serverDate:string|null){
  const claims=runnerJwtClaims317(hint.work_order_jwt)
  const field=(key:string)=>safeValue317(claims[key])
  const jti=safeValue317(hint.jti||claims.jti)
  const session=safeValue317(hint.session_uuid)
  if(!/^[A-Za-z0-9_-]{1,256}$/.test(jti))throw Error('Unsafe spawn hint jti')
  if(session&&!/^[A-Za-z0-9_-]{1,256}$/.test(session))throw Error('Unsafe spawn hint session')
  if(!Number.isInteger(hint.attempt)||hint.attempt<0)throw Error('Unsafe spawn attempt')
  const sources=(hint.sources??[]).map(x=>({
    url:safeValue317(x.url),revision:safeValue317(x.revision)}))
  const env:Record<string,string>={
    CLAUDE_RUNNER_ORDER_ID:jti,CLAUDE_RUNNER_SESSION_ID:session?'session_'+session:session,
    CLAUDE_RUNNER_SESSION_UUID:session,
    CLAUDE_RUNNER_ATTEMPT:String(hint.attempt),
    CLAUDE_RUNNER_POOL_ID:field('ccr:pool_id'),
    CLAUDE_RUNNER_ACCOUNT_EMAIL:field('ccr:spawn_account_email')||field('account_email'),
    CLAUDE_RUNNER_ACCOUNT_ID:field('ccr:spawn_account_id')||field('account_id'),
    CLAUDE_RUNNER_ORDER_SERVER_TIME:serverDate??'',
    CLAUDE_RUNNER_PRIMARY_REPO_URL:sources[0]?.url??'',
    CLAUDE_RUNNER_PRIMARY_REPO_REVISION:sources[0]?.revision??'',
    CLAUDE_RUNNER_REPO_SOURCES:sources.length?JSON.stringify(sources):'',
    CLAUDE_RUNNER_CORRELATION_ID:safeValue317(hint.correlation_id),
    CLAUDE_RUNNER_CLIENT_PLATFORM:safeValue317(hint.client_platform),
  }
  return {jti,env}
}
export async function runSpawnHook317(
  path:string,hint:SpawnHint317,serverDate:string|null,ms:number,
  signal:AbortSignal,onStatus:(msg:string)=>void
):Promise<SpawnHookResult317>{
  const started=Date.now()
  const {jti,env}=workOrderEnvironment317(hint,serverDate)
  const tmp=await mkdtemp(join(tmpdir(),'claude-work-order-'))
  const order=join(tmp,'order.jwt')
  try{
    await writeFile(order,hint.work_order_jwt,{mode:0o600,flag:'wx'})
    const vars: NodeJS.ProcessEnv={...process.env,...env,CLAUDE_RUNNER_WORK_ORDER_FILE:order}
    delete vars.SELF_HOSTED_RUNNER_POOL_SECRET
    delete vars.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET
    return await new Promise<SpawnHookResult317>((resolvePromise)=>{
      let done=false,timedOut=false,execError=false,stderr=''
      const child=spawn(path,[],{env:vars,stdio:['ignore','pipe','pipe'],
        detached:process.platform!=='win32',windowsHide:true})
      let killTimer:ReturnType<typeof setTimeout>|undefined
      const terminate=()=>{
        if(child.pid && process.platform!=='win32'){
          try{process.kill(-child.pid,'SIGTERM')}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')onStatus(String(error))}
        }else child.kill('SIGTERM')
        killTimer=setTimeout(()=>{
          if(child.pid&&process.platform!=='win32'){
            try{process.kill(-child.pid,'SIGKILL')}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')onStatus(String(error))}
          }else child.kill('SIGKILL')
        },5000)
        killTimer.unref?.()
      }
      const timeout=setTimeout(()=>{timedOut=true;terminate()},ms)
      const onAbort=()=>terminate()
      signal.addEventListener('abort',onAbort,{once:true})
      const complete=(exitCode:number|null)=>{
        if(done)return
        done=true;clearTimeout(timeout)
        if(killTimer)clearTimeout(killTimer)
        signal.removeEventListener('abort',onAbort)
        resolvePromise({ok:exitCode===0&&!timedOut&&!execError,
          exitCode,timedOut,execError,stderrTail:stderr.slice(-512),durationMs:Date.now()-started})
      }
      child.stdout?.on('data',data=>onStatus('[runner:hook:spawn-runner] '+String(data).slice(0,4096).trimEnd()))
      child.stderr?.on('data',data=>{stderr=(stderr+String(data)).slice(-512);
        onStatus('[runner:hook:spawn-runner] '+String(data).slice(0,4096).trimEnd())})
      child.once('error',error=>{execError=true;stderr=String(error);complete(null)})
      child.once('close',code=>complete(code))
      if(signal.aborted)onAbort()
      onStatus('[runner:orchestrator] spawn hook started jti='+jti)
    })
  }finally{await rm(tmp,{recursive:true,force:true})}
}
export type OrchestratorState317={
  orchestrator_uuid:string;hostname:string;version:string;pool_id:string;connected:boolean;
  last_poll_at:string|null;last_hint_at:string|null;last_hook_ok_at:string|null;
  last_warm_hook_ok_at:string|null;last_error:string|null;clock_skew_ms:number|null;
  queue_counts:{pending:number;backing_off:number;circuit_broken:number}|null;
  pool_pending_session_count:number|null;pool_active_session_count:number|null;
  warm_hints_dispatched:number;spawnHooks:{ok:number;retryable:number;nonRetryable:number}
}
export function orchestratorMetrics317(state:OrchestratorState317):string{
  const prefix='claude_code_self_hosted_orchestrator_'
  const fields={
    connected:state.connected?1:0,
    queue_pending_sessions:state.queue_counts?.pending??0,
    queue_backing_off:state.queue_counts?.backing_off??0,
    queue_circuit_broken:state.queue_counts?.circuit_broken??0,
    warm_hints_dispatched_total:state.warm_hints_dispatched,
    spawn_hooks_ok_total:state.spawnHooks.ok,
    spawn_hooks_retryable_total:state.spawnHooks.retryable,
    spawn_hooks_nonretryable_total:state.spawnHooks.nonRetryable,
  }
  return Object.entries(fields).map(([key,value])=>
    '# TYPE '+prefix+key+' gauge\n'+prefix+key+' '+value+'\n').join('')
}
export async function runOrchestrator317(
  options:OrchestratorOptions317, deps:{
    api?:OrchestratorApi317;fetchImpl?:typeof fetch;signal?:AbortSignal;
    onStatus?:(line:string)=>void;hook?:typeof runSpawnHook317
  }={}
):Promise<void>{
  const onStatus=deps.onStatus??(text=>process.stderr.write(text+'\n'))
  if(!options.hooksDir)throw Error('orchestrator requires --hooks-dir (or SELF_HOSTED_RUNNER_HOOKS_DIR)')
  const hookPath=join(resolve(options.hooksDir),'spawn-runner')
  const info=await stat(hookPath)
  if(!info.isFile())throw Error('spawn-runner hook is not a regular file: '+hookPath)
  await access(hookPath,constants.X_OK)
  const secret=(options.secretFile?await readFile(options.secretFile,'utf8'):
    process.env.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET??process.env.SELF_HOSTED_RUNNER_POOL_SECRET??'').trim()
  if(!secret)throw Error('No environment secret; set SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET or --environment-secret-file')
  const poolId=runnerEnvironmentId317(secret)
  const api=deps.api??createOrchestratorApi317(options.apiUrl,secret,deps.fetchImpl)
  const state:OrchestratorState317={
    orchestrator_uuid:randomUUID(),hostname:hostname(),version:'2.1.317',pool_id:poolId,
    connected:false,last_poll_at:null,last_hint_at:null,last_hook_ok_at:null,
    last_warm_hook_ok_at:null,last_error:null,clock_skew_ms:null,queue_counts:null,
    pool_pending_session_count:null,pool_active_session_count:null,
    warm_hints_dispatched:0,spawnHooks:{ok:0,retryable:0,nonRetryable:0}}
  const controller=new AbortController(),intake=new AbortController()
  let draining=false,delayTimer:ReturnType<typeof setTimeout>|undefined
  const terminate=(hard:boolean)=>{
    intake.abort()
    if(hard||options.shutdownDrainMs===0||draining){controller.abort();return}
    draining=true
    delayTimer=setTimeout(()=>controller.abort(),options.shutdownDrainMs)
  }
  const term=()=>terminate(false),interrupt=()=>terminate(true)
  process.on('SIGTERM',term);process.on('SIGINT',interrupt)
  const onExternal=()=>terminate(true)
  deps.signal?.addEventListener('abort',onExternal,{once:true})
  if(deps.signal?.aborted)onExternal()
  const server=options.healthPort>0?createServer((req,res)=>{
    if(req.method==='GET'&&req.url==='/healthz'){
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({status:'ok',...state}));return
    }
    if(req.method==='GET'&&req.url==='/metrics'){
      res.writeHead(200,{'content-type':'text/plain; version=0.0.4'});res.end(orchestratorMetrics317(state));return
    }
    res.writeHead(404);res.end('not found')
  }):null
  if(server)await new Promise<void>((resolve,reject)=>{
    server.once('error',reject)
    server.listen(options.healthPort,()=>{server.off('error',reject);resolve()})
  })
  const active=new Set<Promise<void>>()
  let backoff=1000
  const delay=(ms:number,signal:AbortSignal)=>new Promise<void>(resolve=>{
    if(signal.aborted)return resolve()
    const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve()},ms)
    function onAbort(){clearTimeout(timer);resolve()}
    signal.addEventListener('abort',onAbort,{once:true})
  })
  const dispatch=(hint:SpawnHint317,warm:boolean,date:string|null)=>{
    const work=(async()=>{
      state.last_hint_at=new Date().toISOString()
      if(warm)state.warm_hints_dispatched++
      let result:SpawnHookResult317
      try{result=await (deps.hook??runSpawnHook317)(
        hookPath,hint,date,options.hookTimeoutMs,controller.signal,onStatus)}
      catch(error){result={ok:false,exitCode:null,timedOut:false,execError:true,
        stderrTail:String(error),durationMs:0}}
      if(result.ok){
        state.spawnHooks.ok++
        state.last_hook_ok_at=new Date().toISOString()
        if(warm)state.last_warm_hook_ok_at=state.last_hook_ok_at
        return
      }
      const retryable=result.timedOut || result.exitCode===1 ||
        (result.exitCode===null&&!result.execError)
      if(retryable)state.spawnHooks.retryable++
      else state.spawnHooks.nonRetryable++
      state.last_error='spawn-runner hook failed: '+result.stderrTail
      if(warm)return
      try{await api.nack({session_uuid:hint.session_uuid,attempt:hint.attempt,
        error:result.stderrTail.slice(0,512),retryable,
        failure_kind:result.timedOut?'SESSION_FAILURE_KIND_SPAWN_TIMEOUT':
          'SESSION_FAILURE_KIND_SPAWN_HOOK_ERROR'},AbortSignal.timeout(15_000))}
      catch(error){onStatus('[runner:orchestrator] nack failed: '+String(error))}
    })()
    active.add(work)
    void work.finally(()=>active.delete(work))
  }
  try{
    onStatus('[runner:orchestrator] started pool='+poolId+' concurrency='+options.hookConcurrency)
    while(!intake.signal.aborted){
      if(active.size>=options.hookConcurrency){
        await Promise.race(active);continue
      }
      const capacity=options.hookConcurrency-active.size
      state.last_poll_at=new Date().toISOString()
      let result:SpawnPoll317
      try{
        result=await api.poll({orchestrator_uuid:state.orchestrator_uuid,
          hostname:state.hostname,client_version:'2.1.317',max:capacity,
          expected_spawn_seconds:options.expectedSpawnSeconds,
          ...(options.minIdle>0?{min_idle:options.minIdle}:{})},controller.signal)
        state.connected=true;state.last_error=null;backoff=1000
      }catch(error){
        state.connected=false;state.last_error=String(error)
        const status=(error as {httpStatus?:number}).httpStatus
        if([400,401,403,404,426].includes(status??0))throw error
        if(!intake.signal.aborted)await delay(backoff,intake.signal)
        backoff=Math.min(30_000,backoff*2);continue
      }
      state.queue_counts={pending:result.pending_count,backing_off:result.backing_off_count,
        circuit_broken:result.circuit_broken_count}
      state.pool_pending_session_count=result.pool_pending_session_count
      state.pool_active_session_count=result.pool_active_session_count
      if(result.server_date){
        const date=Date.parse(result.server_date)
        if(Number.isFinite(date))state.clock_skew_ms=Date.now()-date
      }
      const sessions=result.hints.slice(0,capacity)
      const extra=result.hints.slice(capacity)
      for(const hint of extra){
        await api.nack({session_uuid:hint.session_uuid,attempt:hint.attempt,
          error:'orchestrator: server over-returned hints (>max)',retryable:true},
          AbortSignal.timeout(15000))
      }
      for(const hint of sessions)dispatch(hint,false,result.server_date)
      const warmSlots=Math.max(0,capacity-sessions.length)
      if(options.minIdle>0)
        for(const hint of result.warm_hints.slice(0,warmSlots))dispatch(hint,true,result.server_date)
      await Promise.allSettled([...active])
      if(!intake.signal.aborted)await delay(5000,intake.signal)
    }
    await Promise.allSettled([...active])
  }finally{
    if(delayTimer)clearTimeout(delayTimer)
    controller.abort()
    deps.signal?.removeEventListener('abort',onExternal)
    process.off('SIGTERM',term);process.off('SIGINT',interrupt)
    if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
  }
}
export async function selfHostedRunnerOrchestratorMain317(argv:readonly string[]):Promise<void>{
  const parsed=parseOrchestratorArgs317(argv)
  if(parsed==='help'){
    process.stdout.write('Usage: claude self-hosted-runner orchestrator [options]\n'+
      '--environment-secret-file <path> --hooks-dir <path> [--hook-concurrency <n>]\n'+
      '[--hook-timeout <seconds>] [--expected-spawn-seconds <seconds>]\n'+
      '[--min-idle <n>] [--shutdown-drain-sec <seconds>] [--health-port <port>]\n')
    return
  }
  await runOrchestrator317(parsed)
}
