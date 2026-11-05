import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {once} from 'node:events'
import {createRunnerHealthServer317,createRunnerHealthState317,
  runnerMetrics317} from '../src/cli/selfHostedRunner/runnerHealth317.ts'

test('Runner health state exposes actual connected and concurrent capacity',()=>{
  const state=createRunnerHealthState317(4)
  assert.equal(state.snapshot.activeSessions,0)
  assert.equal(state.snapshot.connected,false)
  state.update({runnerId:'ccrunner_abc',connected:true,activeSessions:2})
  state.failure('poll disconnected')
  assert.equal(state.snapshot.capacity,4)
  assert.equal(state.snapshot.activeSessions,2)
  assert.equal(state.snapshot.lastError,'poll disconnected')
  const metrics=runnerMetrics317(state.snapshot)
  assert.match(metrics,/claude_code_self_hosted_runner_active_sessions 2/)
  assert.match(metrics,/claude_code_self_hosted_runner_available_capacity 2/)
  assert.match(metrics,/claude_code_self_hosted_runner_connected 1/)
})
test('Runner /healthz and /metrics respond on localhost and stop on shutdown',async()=>{
  const reserve=createServer()
  reserve.listen(0,'127.0.0.1')
  await once(reserve,'listening')
  const address=reserve.address()
  assert.ok(address && typeof address!=='string')
  const port=address.port
  await new Promise((resolve,reject)=>reserve.close(error=>error?reject(error):resolve()))
  const state=createRunnerHealthState317(2)
  const log=[]
  const health=createRunnerHealthServer317(state,msg=>log.push(msg))
  try{
    assert.equal(await health.listen(port),true)
    const reply=await fetch('http://127.0.0.1:'+port+'/healthz')
    assert.equal(reply.status,200)
    const json=await reply.json()
    assert.equal(json.connected,false)
    state.update({runnerId:'ccrunner_test',connected:true,activeSessions:1})
    const update=await(await fetch('http://127.0.0.1:'+port+'/healthz')).json()
    assert.equal(update.connected,true)
    assert.equal(update.runnerId,'ccrunner_test')
    const raw=await(await fetch('http://127.0.0.1:'+port+'/metrics')).text()
    assert.match(raw,/claude_code_self_hosted_runner_available_capacity 1/)
  }finally{await health.close()}
})
