import {expect,test} from 'bun:test'
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
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
      api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600},
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
      claude_code_args:{},environment_variables:{},api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600}}),
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

test('317 x64 tools_host assignments reject before child spawn when the release has no tool host',async()=>{
  const root=temp(),aborted=new AbortController(),steps:string[]=[],messages:string[]=[]
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
    issueSessionToken:async()=>({
      session_token:'session-token',
      tools_host:{tool_server_hosting:4499,api_base_url:'https://api.example.test'},
    }),
    getSessionRemoteConfig:async()=>{steps.push('config');throw Error('tools host must bypass remote config')},
    reportSessionFailure:async()=>{steps.push('failed');aborted.abort();return {}},
    deregisterRunner:async()=>{steps.push('deregister')},
  })
  try{
    await startSelfHostedRunnerHost317({api,baseDir:root,capacity:1,execPath:process.execPath,
      scriptArgs:[],env:{},signal:aborted.signal,onStatus:message=>messages.push(message),
      createChild(){steps.push('spawn');return makeHandle()},
    })
    expect(steps).toEqual(['failed','deregister'])
    expect(messages.join('\n')).toContain('needs a tool server, which this runner cannot host')
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

test('Runner 317: end-to-end source-backed assignment runs inside checked-out revision',async()=>{
  const root=temp(),aborted=new AbortController()
  const bare=join(root,'owner','project.git')
  const writer=join(root,'writer')
  const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim()
  const steps:string[]=[]
  try{
    mkdirSync(join(root,'owner'),{recursive:true})
    git('init','--bare','--initial-branch=main',bare)
    git('init','--initial-branch=main',writer)
    writeFileSync(join(writer,'payload.txt'),'verified-source-content')
    git('-C',writer,'add','.')
    git('-C',writer,'-c','user.name=QA','-c','user.email=qa@example.org',
      'commit','-m','initial')
    git('-C',writer,'remote','add','origin',bare)
    git('-C',writer,'push','origin','main')
    const api=fakeApi({
      pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
      getSessionRemoteConfig:async()=>({
        sources:[{type:'git_repository',url:'file://'+bare,revision:'main'}],
        push_targets:[{type:'git_repository',git_info:{
          repo:'owner/project',branches:['feature/runner']}}],
        claude_code_args:{},environment_variables:{},
        api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600},
      }),
      updateSessionWorkerState:async()=>{steps.push('state')},
      releaseSession:async()=>{steps.push('release');aborted.abort();return {released:true}},
    })
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,scriptArgs:[],
      env:{},signal:aborted.signal,
      createChild(_id,_url,_token,_epoch,cwd){
        steps.push('spawn')
        expect(cwd).toBe(join(root,'session_1','owner_project'))
        expect(readFileSync(join(cwd,'payload.txt'),'utf8')).toBe('verified-source-content')
        expect(git('-C',cwd,'branch','--show-current')).toBe('feature/runner')
        return makeHandle()
      },
    })
    expect(steps).toEqual(['state','spawn','release'])
  }finally{rmSync(root,{recursive:true,force:true})}
})

// The official 317 release push is opt-in and never runs after completion.
test('Runner 317: completed sessions never push even when preservation is enabled',async()=>{
  const root=temp(),aborted=new AbortController()
  const bare=join(root,'owner','project.git'),writer=join(root,'writer')
  const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim()
  try {
    mkdirSync(join(root,'owner'),{recursive:true})
    git('init','--bare','--initial-branch=main',bare)
    git('init','--initial-branch=main',writer)
    writeFileSync(join(writer,'payload.txt'),'initial')
    git('-C',writer,'add','.')
    git('-C',writer,'-c','user.name=QA','-c','user.email=qa@example.org','commit','-m','initial')
    git('-C',writer,'remote','add','origin',bare)
    git('-C',writer,'push','origin','main')
    const api=fakeApi({
      pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
      getSessionRemoteConfig:async()=>({
        sources:[{type:'git_repository',url:'file://'+bare,revision:'main'}],
        push_targets:[{type:'git_repository',git_info:{
          repo:'owner/project',branches:['claude/finish']}}],
        claude_code_args:{},environment_variables:{},
        api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600},
      }),
      releaseSession:async()=>{aborted.abort();return {released:true}},
    })
    await startSelfHostedRunnerHost317({api,baseDir:root,capacity:1,execPath:process.execPath,
      scriptArgs:[],env:{},signal:aborted.signal,pushOutcomeOnRelease:true,
      createChild(_id,_url,_token,_epoch,cwd){
        writeFileSync(join(cwd,'completed.txt'),'complete')
        git('-C',cwd,'add','.')
        git('-C',cwd,'-c','user.name=QA','-c','user.email=qa@example.org',
          'commit','-m','completed')
        return makeHandle('completed')
      },
    })
    expect(git('--git-dir',bare,'branch','--list','claude/finish')).toBe('')
  }finally { rmSync(root,{recursive:true,force:true}) }
})

test('Runner 317: capacity slots prepare independent assignments concurrently and never over-admit', async()=>{
  const root=temp(),aborted=new AbortController(),started:string[]=[],spawned:string[]=[]
  let releaseBarrier!:()=>void
  const bothReady=new Promise<void>(resolve=>{releaseBarrier=resolve})
  let released=0
  const watchdog=setTimeout(()=>{aborted.abort();releaseBarrier()},2500)
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_a','session_b','session_c'],session_assignments:[]}),
    getSessionRemoteConfig:async(id)=>{
      started.push(id)
      if(started.length===2) releaseBarrier()
      await bothReady
      return {
        sources:[],push_targets:[],claude_code_args:{},environment_variables:{},
        api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600},
      }
    },
    releaseSession:async()=>{
      released++
      if(released===2) aborted.abort()
      return {released:true}
    },
  })
  try{
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:2,execPath:process.execPath,
      scriptArgs:[],env:{},signal:aborted.signal,
      createChild(id){spawned.push(id);return makeHandle()},
    })
    expect(started).toEqual(['session_a','session_b'])
    expect(spawned.slice().sort()).toEqual(['session_a','session_b'])
    expect(released).toBe(2)
  }finally {
    clearTimeout(watchdog)
    aborted.abort()
    rmSync(root,{recursive:true,force:true})
  }
})

test('Runner 317: failed preparation is joined while another capacity slot completes',async()=>{
  const root=temp(),aborted=new AbortController(),steps:string[]=[]
  let ready!:()=>void
  const simultaneous=new Promise<void>(resolve=>{ready=resolve})
  let preparations=0
  const watchdog=setTimeout(()=>{aborted.abort();ready()},2500)
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_a','session_b'],session_assignments:[]}),
    getSessionRemoteConfig:async(id)=>{
      preparations++
      if(preparations===2) ready()
      await simultaneous
      if(id==='session_a') throw Error('checkout setup rejected')
      return {
        sources:[],push_targets:[],claude_code_args:{},environment_variables:{},
        api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600},
      }
    },
    reportSessionFailure:async(_,id)=>{steps.push('failure:'+id);return {}},
    releaseSession:async(_,id)=>{steps.push('release:'+id);aborted.abort();return {released:true}},
    deregisterRunner:async()=>{steps.push('deregister')},
  })
  try{
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:2,execPath:process.execPath,scriptArgs:[],
      env:{},signal:aborted.signal,createChild(){return makeHandle()},
    })
    expect(preparations).toBe(2)
    expect(steps).toContain('failure:session_a')
    expect(steps).toContain('release:session_b')
    expect(steps.at(-1)).toBe('deregister')
  }finally{
    clearTimeout(watchdog)
    aborted.abort()
    rmSync(root,{recursive:true,force:true})
  }
})

test('Runner 317: expiring session token refreshes the live CCR child without leaking runner credential',async()=>{
  const root=temp(),aborted=new AbortController(),events:string[]=[],statuses:string[]=[]
  const jwt=(exp:number)=>'header.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.signature'
  const first=jwt(Math.floor(Date.now()/1000)+25)
  const rotated=jwt(Math.floor(Date.now()/1000)+3600)
  let release!:()=>void
  const done=new Promise<'completed'>(resolve=>{release=()=>resolve('completed')})
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
    issueSessionToken:async()=>({session_token:first}),
    refreshToken:async(token)=>{
      expect(token).toBe(first)
      events.push('refresh')
      return {token:rotated}
    },
    releaseSession:async()=>{events.push('release');aborted.abort();return {released:true}},
  })
  try{
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,scriptArgs:[],env:{},
      sessionTokenRefreshIntervalMs:10,signal:aborted.signal,
      onStatus:line=>statuses.push(line),
      createChild(_id,_url,_token,_epoch,_cwd,_env,onTokenAck){
        return {...makeHandle(),done,updateAccessToken(value:string,requestId?:string){
          expect(value).toBe(rotated)
          expect(requestId).toMatch(/^shr-token-session_token-\d+$/)
          events.push('child-token')
          onTokenAck?.(requestId!)
          release()
        }}
      },
    })
    expect(events).toEqual(['refresh','child-token','release'])
    expect(statuses.some(line=>line.includes('session_token update acked by child')))
      .toBe(true)
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('Runner 317: release pushes unfinished work only with the explicit preservation option',async()=>{
  for(const enabled of [false,true]){
    const root=temp(),aborted=new AbortController()
    const bare=join(root,'owner','project.git'),writer=join(root,'writer')
    const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim()
    try{
      mkdirSync(join(root,'owner'),{recursive:true})
      git('init','--bare','--initial-branch=main',bare)
      git('init','--initial-branch=main',writer)
      writeFileSync(join(writer,'payload.txt'),'initial')
      git('-C',writer,'add','.')
      git('-C',writer,'-c','user.name=QA','-c','user.email=qa@example.org','commit','-m','initial')
      git('-C',writer,'remote','add','origin',bare)
      git('-C',writer,'push','origin','main')
      const api=fakeApi({
        pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
        getSessionRemoteConfig:async()=>({
          sources:[{type:'git_repository',url:'file://'+bare,revision:'main'}],
          push_targets:[{type:'git_repository',git_info:{
            repo:'owner/project',branches:['claude/preserve']}}],
          claude_code_args:{},environment_variables:{},
          api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600},
        }),
        releaseSession:async()=>{aborted.abort();return {released:true}},
      })
      await startSelfHostedRunnerHost317({
        api,baseDir:root,capacity:1,execPath:process.execPath,
        scriptArgs:[],env:{},signal:aborted.signal,pushOutcomeOnRelease:enabled,
        createChild(_id,_url,_token,_epoch,cwd){
          writeFileSync(join(cwd,'unfinished.txt'),'unfinished')
          git('-C',cwd,'add','.')
          git('-C',cwd,'-c','user.name=QA','-c','user.email=qa@example.org',
            'commit','-m','unfinished work')
          return makeHandle('interrupted')
        },
      })
      const pushed=git('--git-dir',bare,'branch','--list','claude/preserve')
      expect(pushed.length>0).toBe(enabled)
    }finally{rmSync(root,{recursive:true,force:true})}
  }
})

test('Runner 317: remote session cannot re-inject host-only runner credentials into child',async()=>{
  for(const secretName of [
    'SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET',
    'SELF_HOSTED_RUNNER_POOL_SECRET',
    'SELF_HOSTED_RUNNER_WORK_ORDER_JWT',
  ]) {
    const root=temp(),aborted=new AbortController(),events:string[]=[]
    const api=fakeApi({
      pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
      getSessionRemoteConfig:async()=>({
        sources:[],push_targets:[],claude_code_args:{},
        environment_variables:{[secretName]:'attacker-injected-host-secret'},
        api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600},
      }),
      reportSessionFailure:async(_,id,kind)=>{
        expect(id).toBe('session_1')
        expect(kind).toBe('setup_failed')
        events.push('failure')
        aborted.abort()
        return {}
      },
      deregisterRunner:async()=>{events.push('deregister')},
    })
    try {
      await startSelfHostedRunnerHost317({
        api,baseDir:root,capacity:1,execPath:process.execPath,
        scriptArgs:[],env:{
          SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET:'inherited-host-secret',
          SELF_HOSTED_RUNNER_POOL_SECRET:'inherited-pool-secret',
          SELF_HOSTED_RUNNER_WORK_ORDER_JWT:'inherited-work-order',
        },signal:aborted.signal,
        createChild(){events.push('spawn');return makeHandle()},
      })
      expect(events).toEqual(['failure','deregister'])
    } finally {
      aborted.abort()
      rmSync(root,{recursive:true,force:true})
    }
  }
})

test('Runner 317: real child receives private prompt, MCP and Agent files and cleans all on exit',async()=>{
  const root=temp(),aborted=new AbortController(),statuses:string[]=[]
  try{
    const script=join(root,'inspect-remote-child.mjs')
    const cap=join(root,'delivery-capture.json')
    writeFileSync(script,[
      "import {readFileSync,writeFileSync} from 'node:fs'",
      "const args=process.argv.slice(2)",
      "const valueFor=(flag)=>args[args.indexOf(flag)+1]",
      "const promptFile=valueFor('--system-prompt-file')",
      "const mcpFile=valueFor('--mcp-config')",
      "const agentsFile=valueFor('--agents')",
      "writeFileSync(process.env.TEST_CAPTURE_PATH,JSON.stringify({args,",
      "promptFile,mcpFile,prompt:readFileSync(promptFile,'utf8'),",
      "mcp:readFileSync(mcpFile,'utf8'),agentsFile,agents:readFileSync(agentsFile,'utf8'),auth:process.env.CLAUDE_CODE_OAUTH_TOKEN}))",
    ].join('\n'))
    const mcpContent=JSON.stringify({mcpServers:{privateTool:{command:'node',args:['example.js']}}})
    const api=fakeApi({
      pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
      getSessionRemoteConfig:async()=>({
        sources:[],push_targets:[],api_base_url:'https://api.example.test',inference_auth:{access_token:'inference-test-token',expires_in_seconds:3600},
        environment_variables:{TEST_CAPTURE_PATH:cap},
        claude_code_args:{model:'opus','max-turns':5,'system-prompt':'sensitive runner prompt'},
        mcp_config:{content:Buffer.from(mcpContent).toString('base64')},
        agent_files:[{name:'researcher',content:'---\nname: researcher\ndescription: Research project files\n---\nReview source files\n'}],
      }),
      releaseSession:async()=>{aborted.abort();return {released:true}},
    })
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,
      scriptArgs:[script],env:{},signal:aborted.signal,
      onStatus:line=>statuses.push(line),
    })
    const captured=JSON.parse(readFileSync(cap,'utf8'))
    expect(captured.prompt).toBe('sensitive runner prompt')
    expect(captured.mcp).toBe(mcpContent)
    const agentConfig=JSON.parse(captured.agents)
    expect(agentConfig.researcher.description).toBe('Research project files')
    expect(agentConfig.researcher.prompt).toBe('Review source files')
    expect(captured.auth).toBe('inference-test-token')
    expect(captured.args).toContain('--model')
    expect(captured.args).toContain('opus')
    expect(captured.args).toContain('--max-turns')
    expect(captured.args).toContain('5')
    expect(existsSync(captured.promptFile)).toBe(false)
    expect(existsSync(captured.mcpFile)).toBe(false)
    expect(existsSync(captured.agentsFile)).toBe(false)
    expect(statuses.join(' ')).not.toContain('sensitive runner prompt')
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('Runner 317: expiring inference token refreshes from /remote and updates active child',async()=>{
  const root=temp(),abort=new AbortController(),events:string[]=[]
  let complete!:()=>void
  const childDone=new Promise<'completed'>(resolve=>{complete=()=>resolve('completed')})
  let calls=0
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
    getSessionRemoteConfig:async()=>{
      calls++
      return {sources:[],push_targets:[],claude_code_args:{},
        environment_variables:{},api_base_url:'https://api.example.test',
        inference_auth:{access_token:calls===1?'inference-one':'inference-two',
          expires_in_seconds:calls===1?0.02:3600}}
    },
    releaseSession:async()=>{events.push('release');abort.abort();return {released:true}},
  })
  try{
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,
      scriptArgs:[],env:{},signal:abort.signal,inferenceTokenRefreshIntervalMs:10,
      createChild(_id,_url,_token,_epoch,_cwd,_env){
        return {...makeHandle(),done:childDone,writeStdin(data:string){
          const payload=JSON.parse(data)
          expect(payload.type).toBe('update_environment_variables')
          expect(payload.variables.CLAUDE_CODE_OAUTH_TOKEN).toBe('inference-two')
          events.push('inference-update')
          complete()
        }}
      },
    })
    expect(events).toEqual(['inference-update','release'])
    expect(calls).toBeGreaterThanOrEqual(2)
  }finally{rmSync(root,{recursive:true,force:true})}
})
test('Runner 317: missing inference credentials report a setup failure before spawning',async()=>{
  const root=temp(),abort=new AbortController(),events:string[]=[]
  const api=fakeApi({
    pollWork:async()=>({assignment_ids:['session_1'],session_assignments:[]}),
    getSessionRemoteConfig:async()=>({
      sources:[],push_targets:[],claude_code_args:{},
      environment_variables:{},api_base_url:'https://api.example.test',
    }),
    reportSessionFailure:async()=>{events.push('setup-failure');abort.abort();return {}},
  })
  try{
    await startSelfHostedRunnerHost317({api,baseDir:root,capacity:1,execPath:process.execPath,
      scriptArgs:[],env:{},signal:abort.signal,
      createChild(){events.push('spawn');return makeHandle()}})
    expect(events).toEqual(['setup-failure'])
  }finally{rmSync(root,{recursive:true,force:true})}
})


test('Runner 317: server 401 is fatal without retrying a revoked runner credential', async () => {
  const root=temp(), abort=new AbortController()
  let refreshes=0, polls=0
  const api=fakeApi({
    pollWork:async()=>{
      polls++
      throw new RunnerHttpError317('PollWork',401,'auth')
    },
    refreshToken:async()=>{
      refreshes++
      return {token:'another-token'}
    },
  })
  try {
    await expect(startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,scriptArgs:[],
      env:{},signal:abort.signal,
    })).rejects.toBeInstanceOf(RunnerHttpError317)
    expect(refreshes).toBe(0)
    expect(polls).toBe(1)
  } finally { rmSync(root,{recursive:true,force:true}) }
})

test('Runner 317: local expiring JWT is renewed before polling', async () => {
  const root=temp(),abort=new AbortController(),observed:string[]=[]
  const jwt='e30.'+Buffer.from(JSON.stringify({exp:1})).toString('base64url')+'.signature'
  let refreshes=0
  const api=fakeApi({
    registerRunner:async()=>({runner_id:'runner_1',runner_token:jwt}),
    refreshToken:async token=>{
      expect(token).toBe(jwt)
      refreshes++
      return {token:'runner-token-rotated'}
    },
    pollWork:async token=>{
      observed.push(token)
      abort.abort()
      return {assignment_ids:[],session_assignments:[]}
    },
  })
  try {
    await startSelfHostedRunnerHost317({
      api,baseDir:root,capacity:1,execPath:process.execPath,scriptArgs:[],
      env:{},signal:abort.signal,
    })
    expect(refreshes).toBe(1)
    expect(observed).toEqual(['runner-token-rotated'])
  } finally { rmSync(root,{recursive:true,force:true}) }
})
