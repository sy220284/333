import {test,expect} from 'bun:test'
import {mkdtempSync,writeFileSync,rmSync,utimesSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {checkRunnerIdleHold317,parseRunnerMinutes317} from '../src/cli/selfHostedRunner/runnerIdleHold317.ts'
import {startSelfHostedRunnerHost317} from '../src/cli/selfHostedRunner/runnerHost317.ts'
import type {SelfHostedRunnerApi317} from '../src/cli/selfHostedRunner/runnerApi317.ts'
import type {SessionHandle,SessionActivity} from '../src/bridge/types.ts'

function delay(ms:number){return new Promise<void>(r=>setTimeout(r,ms))}
function harness(onStart:(notify:(a:SessionActivity)=>void)=>void){
 const controller=new AbortController()
 let first=true,finish:()=>void=()=>{},calls=0,killed=0
 const done=new Promise<'interrupted'>(resolve=>{finish=()=>resolve('interrupted')})
 const api={
  registerRunner:async()=>({runner_id:'runner',runner_token:'token'}),
  pollWork:async()=>({assignment_ids:first?(first=false,['session_1']):[],session_assignments:[]}),
  issueSessionToken:async()=>({session_token:'session-token'}),
  getSessionRemoteConfig:async()=>({sources:[],push_targets:[],claude_code_args:{},environment_variables:{},api_base_url:'https://api.example.test',
   inference_auth:{access_token:'runner-test-inference-token',expires_in_seconds:3600}}),
  registerWorker:async()=>1,updateSessionWorkerState:async()=>{},heartbeat:async()=>{},
  refreshToken:async()=>({token:'new-token'}),
  releaseSession:async()=>{calls++;controller.abort();return {released:true}},
  reportSessionFailure:async()=>({}),deregisterRunner:async()=>{},
 } as unknown as SelfHostedRunnerApi317
 const createChild=(_id:string,_sdk:string,_token:string,_epoch:number,_cwd:string,_env:NodeJS.ProcessEnv,
  _ack?:((requestId:string)=>void),notify?:((activity:SessionActivity)=>void)):SessionHandle=>{
  if(notify)onStart(notify)
  return {sessionId:'session_1',done,activities:[],currentActivity:null,accessToken:'session-token',lastStderr:[],
   kill(){killed++;finish()},forceKill(){finish()},writeStdin(){},updateAccessToken(){}}
 }
 return {api,controller,createChild,get releases(){return calls},get killed(){return killed}}
}

test('317 hold-file checks freshness and local regular files',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hold-317-'))
 try{
  const marker=join(dir,'alive'),link=join(dir,'alias')
  writeFileSync(marker,'alive')
  expect(await checkRunnerIdleHold317(marker)).toBe(true)
  symlinkSync(marker,link)
  expect(await checkRunnerIdleHold317(link)).toBe(true)
  const stale=new Date(Date.now()-190_000)
  utimesSync(marker,stale,stale)
  expect(await checkRunnerIdleHold317(marker)).toBe(false)
  expect(await checkRunnerIdleHold317(join(dir,'gone'))).toBe(false)
  expect(await checkRunnerIdleHold317(dir)).toBe(false)
  await expect(checkRunnerIdleHold317('//remote-host/share')).rejects.toThrow('network')
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 minute flag strictly follows x64 0..10080 domain',()=>{
 expect(parseRunnerMinutes317('0','--max-hold-min')).toBe(0)
 expect(parseRunnerMinutes317('1.5','--max-hold-min')).toBe(90_000)
 for(const value of ['-1','10081','NaN','Infinity',''])
   expect(()=>parseRunnerMinutes317(value,'--max-hold-min')).toThrow('non-negative number')
})
test('317 live runner holds a completed turn while marker is fresh, then releases at cap',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hold-runner-317-'))
 try{
  const marker=join(dir,'marker');writeFileSync(marker,'running')
  const h=harness(notify=>setTimeout(()=>notify({type:'result',summary:'done',timestamp:Date.now()}),10))
  const started=Date.now()
  await Promise.race([
   startSelfHostedRunnerHost317({api:h.api,baseDir:dir,capacity:1,execPath:process.execPath,
      scriptArgs:[],env:{},pollIntervalMs:250,signal:h.controller.signal,
      idleReleaseMs:35,holdIdleFile:marker,maxHoldMs:130,createChild:h.createChild}),
   delay(3500).then(()=>{throw new Error('runner idle hold deadline exceeded')})
  ])
  expect(h.releases).toBe(1)
  expect(h.killed).toBeGreaterThan(0)
  expect(Date.now()-started).toBeGreaterThanOrEqual(100)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 user input disarms runner idle release before its deadline',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hold-cancel-317-'))
 try{
  const h=harness(notify=>{
   setTimeout(()=>notify({type:'result',summary:'done',timestamp:Date.now()}),8)
   setTimeout(()=>notify({type:'user',summary:'next turn',timestamp:Date.now()}),28)
  })
  const work=startSelfHostedRunnerHost317({api:h.api,baseDir:dir,capacity:1,
   execPath:process.execPath,scriptArgs:[],env:{},pollIntervalMs:250,signal:h.controller.signal,
   idleReleaseMs:80,createChild:h.createChild,drainWaitMs:0})
  await delay(145)
  expect(h.releases).toBe(0)
  h.controller.abort()
  await work
 }finally{rmSync(dir,{recursive:true,force:true})}
})
