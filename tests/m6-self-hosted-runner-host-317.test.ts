import {expect,test} from 'bun:test'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {SessionHandle} from '../src/bridge/types.ts'
import {SelfHostedRunnerApi317,RunnerHttpError317} from '../src/cli/selfHostedRunner/runnerApi317.ts'
import {startSelfHostedRunnerHost317} from '../src/cli/selfHostedRunner/runnerHost317.ts'

type StubApi = Pick<SelfHostedRunnerApi317,'registerRunner'|'pollWork'|'issueSessionToken'|
  'getSessionRemoteConfig'|'registerWorker'|'updateSessionWorkerState'|'heartbeat'|
  'refreshToken'|'releaseSession'|'reportSessionFailure'|'deregisterRunner'>
function fakeApi(impl: Partial<StubApi>): SelfHostedRunnerApi317 {
  const defaults: StubApi={
    registerRunner:async()=>({runner_id:'runner_1',runner_token:'runner-token'}),
    pollWork:async()=>({assignment_ids:[],session_assignments:[]}),
    issueSessionToken:async()=>({session_token:'session-token'}),
    getSessionRemoteConfig:async()=>({
      sources:[],push_targets:[],claude_code_args:{},
      environment_variables:{TEST_REMOTE_ENV:'test-value'},
      api_base_url:'https://api.example.test',
    }),
    registerWorker:async()=>3,
    updateSessionWorkerState:async()=>{},
    heartbeat:async()=>{},
    refreshToken:async()=>({token:'refreshed-token'}),
    releaseSession:async()=>({released:true}),
    reportSessionFailure:async()=>({}),
    deregisterRunner:async()=>{},
  }
  return {...defaults,...impl} as unknown as SelfHostedRunnerApi317
}
function makeHandle(result: 'completed'|'failed'|'interrupted' = 'completed'): SessionHandle {
  return {
    sessionId:'session_1',accessToken:'session-token',activities:[],currentActivity:null,
    lastStderr:[], done:Promise.resolve(result),kill(){},forceKill(){},writeStdin(){},updateAccessToken(){},
  }
}
const temp = () => mkdtempSync(join(tmpdir(),'runner-host-317-'))

test('Runner 317: registered work flows through isolated CCR session, worker epoch and release', async () => {
  const root=temp(),aborted=new AbortController(),steps:string[]=[]
  const api=fakeApi({
    pollWork:async(_,__,capacity)=>{
      steps.push('poll:'+capacity)
      return {assignment_ids:['session_1'],session_assignments:[]}
    },
    issueSessionToken:async()=>{steps.push('token');return {session_token:'session-token'}},
    registerWorker:async()=>{steps.push('epoch');return 9},
    updateSessionWorkerState:async()=>{steps.push('worker-state')},
    releaseSession:async()=>{steps.push('release');aborted.abort();return {released:true}},
    deregisterRunner:async()=>{steps.push('deregister')},
  })
  try {
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,scriptArgs:[],
      env:{SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET:'must-not-leak',SAFE:'value'},
      pollIntervalMs:250,signal:aborted.signal,
      createChild(id,url,token,epoch,dir,env){
        steps.push('spawn')
        expect(id).toBe('session_1')
        expect(url).toBe('https://api.example.test/v1/code/sessions/session_1')
        expect(token).toBe('session-token')
        expect(epoch).toBe(9)
        expect(dir).toBe(join(root,'session_1'))
        expect(env.TEST_REMOTE_ENV).toBe('test-value')
        expect(env.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET).toBeUndefined()
        return makeHandle()
      },
    })
    expect(steps).toContain('spawn')
    expect(steps).toContain('release')
    expect(steps.at(-1)).toBe('deregister')
    expect(steps.indexOf('token')).toBeLessThan(steps.indexOf('epoch'))
    expect(steps.indexOf('epoch')).toBeLessThan(steps.indexOf('worker-state'))
    expect(steps.indexOf('worker-state')).toBeLessThan(steps.indexOf('spawn'))
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('Runner 317: source-backed assignment is reported as setup failure before spawn',async()=>{
  const root=temp(),aborted=new AbortController(),steps:string[]=[]
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
    getSessionRemoteConfig:async()=>({sources:[{repo:'unconfigured'}],push_targets:[],
      claude_code_args:{},environment_variables:{},api_base_url:'https://api.example.test'}),
    reportSessionFailure:async()=>{steps.push('failed');aborted.abort();return {}},
    deregisterRunner:async()=>{steps.push('deregister')},
  })
  try{
    await startSelfHostedRunnerHost317({api,baseDir:root,capacity:1,execPath:process.execPath,
      scriptArgs:[],env:{},signal:aborted.signal,createChild(){
        throw new Error('Unsafe source should not spawn a child')
      }})
    expect(steps).toEqual(['failed','deregister'])
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('Runner 317: authentication failures stop polling and unregister the runner',async()=>{
  const root=temp(), steps:string[]=[]
  const api=fakeApi({
    pollWork:async()=>{throw new RunnerHttpError317('PollWork',403,'auth')},
    deregisterRunner:async()=>{steps.push('deregister')},
  })
  try{
    await expect(startSelfHostedRunnerHost317({api,baseDir:root,capacity:1,
      execPath:process.execPath,scriptArgs:[],env:{}})).rejects.toThrow('PollWork')
    expect(steps).toEqual(['deregister'])
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('Runner 317: heartbeat follows worker admission and stops when the child exits',async()=>{
  const root=temp(),aborted=new AbortController(),steps:string[]=[]
  let complete!: (result: 'completed'|'failed'|'interrupted')=>void
  const pending=new Promise<'completed'|'failed'|'interrupted'>(resolve=>{complete=resolve})
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
    updateSessionWorkerState:async(_,__,___,epoch,status)=>{
      expect(epoch).toBe(3)
      expect(status).toBeUndefined()
      steps.push('state')
    },
    heartbeat:async()=>{steps.push('heartbeat');complete('completed')},
    releaseSession:async()=>{steps.push('release');aborted.abort();return {released:true}},
  })
  try{
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,scriptArgs:[],
      env:{},heartbeatIntervalMs:10,signal:aborted.signal,
      createChild(){steps.push('spawn');return {...makeHandle(),done:pending}},
    })
    expect(steps[0]).toBe('state')
    expect(steps.indexOf('state')).toBeLessThan(steps.indexOf('spawn'))
    expect(steps.indexOf('spawn')).toBeLessThan(steps.indexOf('heartbeat'))
    expect(steps.indexOf('heartbeat')).toBeLessThan(steps.indexOf('release'))
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('Runner 317: worker state admission failure prevents spawning an unregistered session',async()=>{
  const root=temp(),aborted=new AbortController(),steps:string[]=[]
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
    updateSessionWorkerState:async()=>{steps.push('state');throw Error('worker epoch rejected')},
    reportSessionFailure:async()=>{steps.push('failure');aborted.abort();return {}},
  })
  try{
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,scriptArgs:[],env:{},signal:aborted.signal,
      createChild(){steps.push('spawn');return makeHandle()},
    })
    expect(steps).toEqual(['state','failure'])
  }finally{rmSync(root,{recursive:true,force:true})}
})
