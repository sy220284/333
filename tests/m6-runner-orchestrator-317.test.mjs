import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm,chmod} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  parseOrchestratorArgs317,runnerJwtClaims317,runnerEnvironmentId317,
  workOrderEnvironment317,runOrchestrator317,createOrchestratorApi317,
} from '../src/cli/selfHostedRunner/orchestrator317.ts'
const jwt=value=>'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify(value)).toString('base64url')+'.sig'
const secret=jwt({'ccr:pool_id':'ccpool_test'})
const hint={jti:'test-job-1',session_uuid:'abc123',attempt:1,work_order_jwt:jwt({
  jti:'test-job-1','ccr:pool_id':'ccpool_test','ccr:spawn_account_id':'account1'
}),sources:[{url:'https://example.org/repo.git',revision:'main'}]}
test('orchestrator accepts official flags and validates lease and concurrency',()=>{
  const x=parseOrchestratorArgs317(['--hook-concurrency','3','--min-idle','2',
    '--hook-timeout','15','--expected-spawn-seconds','120','--health-port','0'])
  assert.equal(x.hookConcurrency,3);assert.equal(x.minIdle,2)
  assert.equal(x.healthPort,0)
  assert.throws(()=>parseOrchestratorArgs317(['--hook-concurrency','0']),/within/)
  assert.throws(()=>parseOrchestratorArgs317(['--hook-timeout','90',
    '--expected-spawn-seconds','90']),/SIGKILL grace/)
  assert.equal(parseOrchestratorArgs317(['--help']),'help')
})
test('orchestrator derives pool and exports structured work-order environment',()=>{
  assert.equal(runnerEnvironmentId317(secret),'ccpool_test')
  assert.equal(runnerJwtClaims317(secret)['ccr:pool_id'],'ccpool_test')
  const {jti,env}=workOrderEnvironment317(hint,'Thu, 05 Nov 2026 04:00:00 GMT')
  assert.equal(jti,'test-job-1')
  assert.equal(env.CLAUDE_RUNNER_POOL_ID,'ccpool_test')
  assert.equal(env.CLAUDE_RUNNER_ATTEMPT,'1')
  assert.equal(env.CLAUDE_RUNNER_ORDER_ID,'test-job-1')
  assert.throws(()=>workOrderEnvironment317({...hint,attempt:-1},null),/attempt/)
})
test('spawn-hints poll/nack use original paths and bearer auth',async()=>{
  const recorded=[]
  const api=createOrchestratorApi317('https://api.anthropic.com',secret,
    async (url,options)=>{
      recorded.push({url,options})
      return Response.json(url.endsWith('/poll')?
        {hints:[hint],warm_hints:[],pending_count:1,backing_off_count:0,circuit_broken_count:0}: {})
    })
  const data=await api.poll({max:1},AbortSignal.timeout(2000))
  assert.equal(data.hints.length,1)
  await api.nack({session_uuid:'abc123',attempt:1,error:'failure',retryable:true},AbortSignal.timeout(2000))
  assert.equal(recorded[0].url,'https://api.anthropic.com/v1/code/runners/self-hosted/spawn-hints/poll')
  assert.equal(recorded[1].url,'https://api.anthropic.com/v1/code/runners/self-hosted/spawn-hints/nack')
  assert.equal(recorded[0].options.headers.authorization,'Bearer '+secret)
})
test('successful nack may be empty HTTP 204 while poll requires JSON',async()=>{
  const seen=[]
  const api=createOrchestratorApi317('https://api.anthropic.com',secret,
    async (url,options)=>{
      seen.push(url)
      return url.endsWith('/nack')?
        new Response(null,{status:204}):
        Response.json({hints:[],warm_hints:[]})
    })
  await api.nack({session_uuid:'abc123',attempt:1,retryable:true},
    AbortSignal.timeout(2000))
  assert.equal(seen.length,1)
})
test('orchestrator dispatches and nacks retryable hook failures; shutdown drains',async()=>{
  const home=await mkdtemp(join(tmpdir(),'orchestrator317-'))
  const original=process.env.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET
  try{
    const executable=join(home,'spawn-runner')
    await writeFile(executable,'#!/bin/sh\nexit 0\n',{mode:0o755});await chmod(executable,0o755)
    process.env.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET=secret
    const options=parseOrchestratorArgs317(['--hooks-dir',home,'--health-port','0'])
    const ctrl=new AbortController(),nacked=[]
    const api={
      async poll(){return{hints:[hint],warm_hints:[],server_date:null,
        pending_count:1,backing_off_count:0,circuit_broken_count:0,
        pool_pending_session_count:1,pool_active_session_count:0}},
      async nack(value){nacked.push(value)}
    }
    let count=0
    await runOrchestrator317(options,{
      api,signal:ctrl.signal,
      hook:async()=>{
        count++;ctrl.abort()
        return{ok:false,exitCode:1,timedOut:false,execError:false,
          stderrTail:'recoverable',durationMs:1}
      },onStatus:()=>{}
    })
    assert.equal(count,1)
    assert.deepEqual(nacked.map(x=>[x.session_uuid,x.retryable]),[['abc123',true]])
  }finally{
    if(original===undefined)delete process.env.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET
    else process.env.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET=original
    await rm(home,{recursive:true,force:true})
  }
})
