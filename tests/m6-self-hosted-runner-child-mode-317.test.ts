import {test,expect} from 'bun:test'
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createSessionSpawner} from '../src/bridge/sessionRunner.ts'

test('317 BYOC child: remote resume, session-scoped settings and correct execution environment',async()=>{
  const base=mkdtempSync(join(tmpdir(),'byoc-spawn-317-'))
  try{
    const script=join(base,'inspect-child.mjs')
    writeFileSync(script,[
      "import {writeFileSync} from 'node:fs'",
      "writeFileSync(process.env.TEST_CAPTURE_PATH,JSON.stringify({args:process.argv.slice(2),kind:process.env.CLAUDE_CODE_ENVIRONMENT_KIND,configDir:process.env.CLAUDE_CONFIG_DIR,remote:process.env.CLAUDE_CODE_REMOTE,remoteType:process.env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE,token:process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN,epoch:process.env.CLAUDE_CODE_WORKER_EPOCH,ccr:process.env.CLAUDE_CODE_USE_CCR_V2,api:process.env.ANTHROPIC_BASE_URL,scopes:process.env.CLAUDE_CODE_OAUTH_SCOPES,oauth:process.env.CLAUDE_CODE_OAUTH_TOKEN,resumeTurn:process.env.CLAUDE_CODE_RESUME_INTERRUPTED_TURN,resumeCutoff:process.env.CLAUDE_CODE_RESUME_SHOWS_CUT_OFF_CALLS,resumePrompt:process.env.CLAUDE_CODE_RESUME_PROMPT}))",
    ].join('\n'))
    const cap1=join(base,'byoc.json')
    const cap2=join(base,'bridge.json')
    const conf=join(base,'state')
    mkdirSync(conf,{recursive:true})
    const url='https://session.example.test/v1/code/sessions/abc_123'
    const debugLines:string[]=[]
    const spawnBase={
      execPath:process.execPath,scriptArgs:[script],verbose:false,sandbox:false,
      onDebug:(line:string)=>debugLines.push(line),
    }
    const byoc=createSessionSpawner({...spawnBase,
      additionalArgs:['--model','sonnet','--max-turns','7'],
      additionalDirs:[join(base,'repo-one'),join(base,'repo-two')],
      env:{...process.env,TEST_CAPTURE_PATH:cap1},
      runnerRuntime:{apiBaseUrl:'https://session.example.test',configDir:conf,inferenceToken:'inference-for-agent'}})
    const result=byoc.spawn({sessionId:'abc_123',sdkUrl:url,accessToken:'single-session-token',
      useCcrV2:true,workerEpoch:7},base)
    expect(await result.done).toBe('completed')
    const first=JSON.parse(readFileSync(cap1,'utf8'))
    expect(first.args).toContain('--resume='+url)
    expect(first.args).not.toContain('--session-id')
    expect(first.args).toContain('--model')
    expect(first.args).toContain('sonnet')
    expect(debugLines.some(line=>line.includes('arguments (values redacted)'))).toBe(true)
    expect(debugLines.some(line=>line.includes('Child args:') && line.includes('sonnet'))).toBe(false)
    expect(first.args).toContain('--max-turns')
    expect(first.args).toContain('7')
    const addDirIndices=first.args.flatMap((value:string,index:number)=>
      value==='--add-dir'?[index]:[])
    expect(addDirIndices).toHaveLength(2)
    expect(first.args[addDirIndices[0]+1]).toBe(join(base,'repo-one'))
    expect(first.args[addDirIndices[1]+1]).toBe(join(base,'repo-two'))
    expect(first.kind).toBe('byoc')
    expect(first.remote).toBe('true')
    expect(first.remoteType).toBe('self_hosted')
    expect(first.configDir).toBe(conf)
    expect(first.token).toBe('single-session-token')
    expect(first.epoch).toBe('7')
    expect(first.ccr).toBe('1')
    expect(first.oauth).toBe('inference-for-agent')
    expect(first.scopes).toBe('user:inference user:ccr_inference user:file_upload')
    expect(first.resumeTurn).toBe('1')
    expect(first.resumeCutoff).toBe('1')
    expect(first.resumePrompt).toContain('Continue from where you left off')
    expect(first.resumePrompt).toContain('[Tool call interrupted')
    expect(first.api).toBe('https://session.example.test')

    const bridge=createSessionSpawner({...spawnBase,env:{...process.env,TEST_CAPTURE_PATH:cap2}})
    const other=bridge.spawn({sessionId:'abc_123',sdkUrl:url,accessToken:'bridge-token'},base)
    expect(await other.done).toBe('completed')
    const second=JSON.parse(readFileSync(cap2,'utf8'))
    expect(second.kind).toBe('bridge')
    expect(second.oauth).toBeUndefined()
    expect(second.resumeTurn).toBeUndefined()
    expect(second.resumePrompt).toBeUndefined()
    expect(second.args).toContain('--session-id')
    expect(second.args).toContain('abc_123')
    expect(second.args.some((a:string)=>a.startsWith('--resume='))).toBe(false)
  }finally{rmSync(base,{recursive:true,force:true})}
})

test('317 BYOC child: control_response token receipt reaches runner acknowledgement callback',async()=>{
  const root=mkdtempSync(join(tmpdir(),'byoc-token-ack-317-'))
  try{
    const script=join(root,'emit-ack.mjs')
    writeFileSync(script,[
      "process.stdout.write(JSON.stringify({type:'control_response',response:{request_id:'shr-token-session_token-42'}})+'\\n')",
      "process.stdout.write(JSON.stringify({type:'control_response',response:{request_id:'ordinary'}})+'\\n')",
    ].join('\n'))
    const acks:string[]=[]
    const child=createSessionSpawner({
      execPath:process.execPath,scriptArgs:[script],env:{},verbose:false,sandbox:false,
      onDebug:()=>{},onTokenAck:(_sessionId,id)=>acks.push(id),
    }).spawn({
      sessionId:'session_1',sdkUrl:'https://example.test/v1/code/sessions/session_1',
      accessToken:'child-token',
    },root)
    expect(await child.done).toBe('completed')
    expect(acks).toEqual(['shr-token-session_token-42'])
  }finally{rmSync(root,{recursive:true,force:true})}
})
