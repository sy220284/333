import {test,expect} from 'bun:test'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {SELF_HOSTED_RUNNER_TOOLS} from '../src/cli/selfHostedRunner/wizardTools317.ts'
import {runnerWizardCommand317} from '../src/cli/selfHostedRunner/wizard317.ts'
import {getRunnerPool317,listRunnerMachines317,listRunnerSessions317,
  listRunnerSecrets317,requeueRunnerSession317,probeRunnerLocal317,tailRunnerLog317
} from '../src/cli/selfHostedRunner/runnerAdmin317.ts'
const names=[
  'self_hosted_runner_get_pool','self_hosted_runner_list_runners',
  'self_hosted_runner_list_sessions','self_hosted_runner_list_secrets',
  'self_hosted_runner_read_health','self_hosted_runner_read_metrics',
  'self_hosted_runner_spawn_local','self_hosted_runner_tail_log',
  'self_hosted_runner_requeue_session'
]
test('the 9 official operator tools are only visible to explicit wizard sessions',()=>{
  expect(SELF_HOSTED_RUNNER_TOOLS.map(t=>t.name)).toEqual(names)
  const before=process.env.CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD
  try{
    delete process.env.CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD
    expect(SELF_HOSTED_RUNNER_TOOLS.every(t=>!t.isEnabled())).toBe(true)
    process.env.CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD='setup'
    expect(SELF_HOSTED_RUNNER_TOOLS.every(t=>t.isEnabled())).toBe(true)
    process.env.CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD='untrusted'
    expect(SELF_HOSTED_RUNNER_TOOLS.every(t=>!t.isEnabled())).toBe(true)
  }finally{
    if(before===undefined)delete process.env.CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD
    else process.env.CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD=before
  }
  const setup=runnerWizardCommand317('setup',[],{isCompiled:true,execPath:'claude'})
  const doctor=runnerWizardCommand317('doctor',[],{isCompiled:true,execPath:'claude'})
  expect(setup.args.join(' ')).toContain('self_hosted_runner_spawn_local')
  expect(doctor.args.join(' ')).toContain('self_hosted_runner_requeue_session')
})
test('runner admin tools call the official API paths with OAuth and preserve equivalent UI',async()=>{
  const logs:Array<{url:string,method:string,auth:string,body:string|undefined}>=[]
  const deps={
    credentials:async()=>({accessToken:'oauth-token'}),
    fetchImpl:async (url:string,opts:RequestInit)=>{
      logs.push({url,method:opts.method!,auth:(opts.headers as Record<string,string>).Authorization,
        body:opts.body as string|undefined})
      return Response.json(
        url.includes('/sessions/')?{excluded_count:2}:
        url.includes('/runners?')?{runners:[{id:'ccrunner_one'}]}:
        url.includes('/secrets')?{secrets:[{id:'key_meta'}]}:
        url.includes('/sessions')?{sessions:[{id:'ccsess_one'}]}:
        {pool:{alive_runner_count:1}})
    },
  } as const
  const pool=await getRunnerPool317('ccpool_abc',deps)
  expect(pool.pool).toEqual({alive_runner_count:1})
  expect(pool.equivalent.ui).toContain('Cloud environments')
  expect((await listRunnerMachines317('ccpool_abc',deps)).runners).toHaveLength(1)
  expect((await listRunnerSessions317('ccpool_abc','queued',deps)).sessions).toHaveLength(1)
  expect((await listRunnerSecrets317('ccpool_abc',deps)).secrets).toHaveLength(1)
  expect((await requeueRunnerSession317('ccsess_one','ccrunner_one',deps)).excluded_count).toBe(2)
  expect(logs.map(v=>v.url)).toEqual([
    'https://api.anthropic.com/v1/code/runners/self-hosted/pools/ccpool_abc',
    'https://api.anthropic.com/v1/code/runners/self-hosted/runners?pool_id=ccpool_abc',
    'https://api.anthropic.com/v1/code/runners/self-hosted/pools/ccpool_abc/sessions?status=queued',
    'https://api.anthropic.com/v1/code/runners/self-hosted/pools/ccpool_abc/secrets',
    'https://api.anthropic.com/v1/code/runners/self-hosted/sessions/ccsess_one/requeue',
  ])
  expect(logs.every(x=>x.auth==='Bearer oauth-token')).toBe(true)
  expect(JSON.parse(logs.at(-1)!.body!)).toEqual({runner_id:'ccrunner_one'})
})
test('runner admin refuses unsafe IDs before any network call and propagates 403',async()=>{
  let calls=0
  const deps={credentials:async()=>({accessToken:'t'}),fetchImpl:async()=>{
    calls++;return Response.json({error:{message:'not authorized'}},{status:403})
  }}
  await expect(getRunnerPool317('../escape',deps)).rejects.toThrow('Invalid pool_id')
  expect(calls).toBe(0)
  await expect(getRunnerPool317('ccpool_test',deps)).rejects.toThrow('HTTP 403')
})
test('local Runner /healthz and /metrics return grounded data; log secrets are redacted',async()=>{
  const fetchImpl=async (url:string)=>url.endsWith('/healthz')?
    Response.json({status:'ok',connected:true}):
    new Response('# HELP note\nclaude_code_self_hosted_runner_available_capacity 2\n'+
      'claude_code_self_hosted_runner_available_capacity 3\n')
  const health=await probeRunnerLocal317('healthz',8080,fetchImpl)
  expect(health).toEqual({health:{status:'ok',connected:true}})
  const metrics=await probeRunnerLocal317('metrics',8080,fetchImpl)
  expect(metrics.gauges).toEqual({available_capacity:5})
  const dir=await mkdtemp(join(tmpdir(),'runner-tools-'))
  try{
    const f=join(dir,'runner.log')
    await writeFile(f,'Auth: Bearer ABC\nANTHROPIC_API_KEY=sk-ant-testsecret\n')
    const log=await tailRunnerLog317(f)
    expect(log.bytes_read).toBeGreaterThan(0)
    expect(log.lines).not.toContain('ABC')
    expect(log.lines).not.toContain('sk-ant-testsecret')
  }finally{await rm(dir,{recursive:true,force:true})}
})
