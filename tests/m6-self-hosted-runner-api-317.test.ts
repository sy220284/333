import { describe, expect, test } from 'bun:test'
import { RunnerHttpError317, SelfHostedRunnerApi317 } from '../src/cli/selfHostedRunner/runnerApi317.ts'

function mockClient(handler: (path: string, init: RequestInit) => Promise<Response>) {
  const calls: Array<{path: string; method: string; token: string; body: unknown; headers: Headers}> = []
  const client = new SelfHostedRunnerApi317({
    baseUrl: 'https://runner.example.test',
    poolSecret: 'environment-secret',
    capabilities: ['runner-pty'],
    fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
      const options = init ?? {}
      const headers = new Headers(options.headers)
      const path = new URL(String(url)).pathname
      calls.push({path, method: options.method ?? 'GET',
        token: headers.get('authorization') ?? '',
        headers, body: options.body ? JSON.parse(String(options.body)) as unknown : null})
      return handler(path, options)
    }) as typeof fetch,
  })
  return {client, calls}
}

describe('2.1.317 self-hosted runner API', () => {
  test('registration, polling and session token preserve original wire fields and credential scope', async () => {
    const {client, calls} = mockClient(async path => {
      if (path.endsWith('/runners/register')) return Response.json({runner_id:'runner_123',runner_token:'runner-token'})
      if (path.endsWith('/poll')) return Response.json({assignment_ids:['session_456'],
        lease_expires_at:'2026-11-05T00:00:00Z',session_assignments:[]})
      if (path.endsWith('/token')) return Response.json({session_token:'session-token'})
      throw new Error('Unexpected endpoint: ' + path)
    })
    const registration = await client.registerRunner({clientLabel:'office',serverAutoModeLists:'no-allow'})
    const poll = await client.pollWork(registration.runner_token,registration.runner_id,3)
    const token = await client.issueSessionToken(registration.runner_token,poll.assignment_ids[0])
    expect(poll.assignment_ids).toEqual(['session_456'])
    expect(token.session_token).toBe('session-token')
    expect(calls.map(x=>x.path)).toEqual([
      '/v1/code/runners/self-hosted/runners/register',
      '/v1/code/runners/self-hosted/runners/runner_123/poll',
      '/v1/code/runners/self-hosted/sessions/session_456/token',
    ])
    expect(calls[0].token).toBe('Bearer environment-secret')
    expect(calls[1].token).toBe('Bearer runner-token')
    expect(calls[2].token).toBe('Bearer runner-token')
    expect(calls[0].headers.get('anthropic-version')).toBe('2023-06-01')
    expect(calls[0].headers.get('x-self-hosted-runner-version')).toBe('2.1.317')
    expect(calls[0].body).toEqual({
      runner_version:'2.1.317',capabilities:['runner-pty'],use_anthropic_git_proxy:false,
      server_auto_mode_lists:'SERVER_AUTO_MODE_LISTS_NO_ALLOW',client_label:'office',
    })
    expect(calls[1].body).toEqual({available_capacity:3})
  })

  test('worker lifecycle owns epoch and session token, not runner environment secret', async () => {
    const {client, calls} = mockClient(async path => {
      if (path.endsWith('/worker/register')) return Response.json({worker_epoch:7})
      return Response.json({})
    })
    const epoch = await client.registerWorker('https://remote.example.test','session_1','session-token')
    await client.updateSessionWorkerState('https://remote.example.test','session_1','session-token',epoch,'busy')
    await client.updateSessionWorkerState('https://remote.example.test','session_1','session-token',epoch)
    await client.heartbeat('https://remote.example.test','session_1','session-token',epoch)
    await client.postWorkerEvents('https://remote.example.test','session_1','session-token',epoch,[{type:'turn_started'}])
    await client.forwardDiagnostics('https://remote.example.test','session_1','session-token',epoch,[])
    expect(calls).toHaveLength(5)
    expect(calls.every(x => x.token === 'Bearer session-token')).toBe(true)
    expect(calls[0].body).toEqual({session_id:'session_1'})
    expect(calls[1].body).toEqual({worker_epoch:7,worker_status:'busy'})
    expect(calls[2].body).toEqual({worker_epoch:7})
    expect(calls[3].body).toEqual({worker_epoch:7})
    expect(calls[4].body).toEqual({worker_epoch:7,events:[{payload:{type:'turn_started'}}]})
  })

  test('release, deregistration, refresh and remote configuration are fully routed', async () => {
    const {client,calls} = mockClient(async path => {
      if (path.endsWith('/release')) return Response.json({released:false})
      if (path.endsWith('/remote')) return Response.json({api_base_url:'https://api.example.test'})
      if (path.endsWith('/refresh')) return Response.json({token:'new-runner-token'})
      return Response.json({})
    })
    expect(await client.releaseSession('runner-token','session_1')).toEqual({released:false})
    expect((await client.getSessionRemoteConfig('session_1','session-token')).sources).toEqual([])
    expect((await client.refreshToken('runner-token')).token).toBe('new-runner-token')
    await client.reportSessionFailure('runner-token','session_1','setup_failed','checkout_timeout')
    await client.deregisterRunner('runner-token',{reason:'shutdown_signal'})
    expect(calls.map(x=>x.path)).toEqual([
      '/v1/code/runners/self-hosted/sessions/session_1/release',
      '/v1/code/sessions/session_1/remote',
      '/v1/code/auth/refresh',
      '/v1/code/runners/self-hosted/sessions/session_1/report-failure',
      '/v1/code/runners/self-hosted/deregister',
    ])
  })

  test('malformed poll response is rejected before any assignment can execute', async () => {
    for (const data of [null, 'not-json-object', {assignment_ids:'session_1'}, {assignment_ids:['session_1/../../']},
      {assignment_ids:[12]}, {assignment_ids:{0:'session_1'}}]) {
      const {client} = mockClient(async () => Response.json(data))
      await expect(client.pollWork('runner-token','runner_1',1)).rejects.toThrow()
    }
    const {client} = mockClient(async () => Response.json({assignment_ids:[]}))
    await expect(client.pollWork('runner-token','../unsafe',1)).rejects.toThrow()
    await expect(client.pollWork('runner-token','runner_1',-1)).rejects.toThrow()
  })

  test('403 org disable and 409 epoch mismatch are terminal errors', async () => {
    for (const [status, reason, kind] of [
      [403,'self_hosted_runners_disabled_by_org','disabled'],
      [409,'session_not_active','epoch'],
    ] as const) {
      const {client} = mockClient(async () => Response.json({error:{
        resource: reason === 'self_hosted_runners_disabled_by_org' ? reason : undefined,
        type: reason,
      }},{status}))
      try {
        await client.issueSessionToken('runner-token','session_1')
        throw new Error('Should reject')
      } catch (error) {
        expect(error).toBeInstanceOf(RunnerHttpError317)
        expect((error as RunnerHttpError317).kind).toBe(kind)
      }
    }
  })

  test('tools_host validation rejects unusable worker hosts', async () => {
    const {client} = mockClient(async () => Response.json({session_token:'session',
      tools_host:{tool_server_hosting:0,api_base_url:'https://remote.example.test'}}))
    await expect(client.issueSessionToken('runner-token','session_1')).rejects.toThrow('tools_host')
  })

  test('spawn hints and NACK preserve work-order lease and error boundaries',async()=>{
    const {client,calls}=mockClient(async path=>{
      if(path.endsWith('/spawn-hints/poll')) return Response.json({
        hints:[{session_uuid:'assignment_123',attempt:2,work_order_jwt:'work-jwt',sources:[]}],
        warm_hints:[{session_uuid:'standby_456',attempt:1,work_order_jwt:'standby-jwt',sources:[]}],
        pending_count:1,backing_off_count:0,circuit_broken_count:0,
        pool_pending_session_count:2,pool_active_session_count:1,slots:3,
      },{headers:{date:'Thu, 05 Nov 2026 01:00:00 GMT'}})
      if(path.endsWith('/spawn-hints/nack')) return Response.json({})
      throw new Error('Unexpected endpoint '+path)
    })
    const hints=await client.pollSpawnHints({available_capacity:2,expected_spawn_seconds:120})
    expect(hints.hints[0].session_uuid).toBe('assignment_123')
    expect(hints.warm_hints[0].work_order_jwt).toBe('standby-jwt')
    expect(hints.pool_active_session_count).toBe(1)
    expect(hints.slots).toBe(3)
    expect(hints.server_date).toBe('Thu, 05 Nov 2026 01:00:00 GMT')
    await client.nackSpawnHint({session_uuid:'assignment_123',attempt:2,
      error:'hook failed',retryable:true,failure_kind:'spawn_hook'})
    expect(calls.map(c=>c.path)).toEqual([
      '/v1/code/runners/self-hosted/spawn-hints/poll',
      '/v1/code/runners/self-hosted/spawn-hints/nack',
    ])
    expect(calls.every(c=>c.token==='Bearer environment-secret')).toBe(true)
    expect(calls[1].body).toEqual({
      session_uuid:'assignment_123',attempt:2,error:'hook failed',
      retryable:true,failure_kind:'spawn_hook',
    })
  })

  test('GET /remote includes supported capabilities and session-only credential',async()=>{
    const {client,calls}=mockClient(async()=>Response.json({sources:[],push_targets:[]}))
    await client.getSessionRemoteConfig('session_1','session-token')
    expect(calls).toHaveLength(1)
    expect(calls[0].headers.get('x-self-hosted-runner-capabilities')).toBe('runner-pty')
    expect(calls[0].headers.get('x-self-hosted-runner-version')).toBeNull()
    expect(calls[0].token).toBe('Bearer session-token')
  })

  test('spawn hint validation rejects non-array server responses and unsafe identifiers',async()=>{
    const {client}=mockClient(async()=>Response.json({hints:[],warm_hints:'not-an-array'}))
    await expect(client.pollSpawnHints({available_capacity:1})).rejects.toThrow('hint list')
    await expect(client.nackSpawnHint({session_uuid:'../escape',attempt:1,
      error:'invalid',retryable:false})).rejects.toThrow('Invalid')
  })

})
