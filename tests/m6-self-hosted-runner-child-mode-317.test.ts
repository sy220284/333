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
      "writeFileSync(process.env.TEST_CAPTURE_PATH,JSON.stringify({args:process.argv.slice(2),kind:process.env.CLAUDE_CODE_ENVIRONMENT_KIND,configDir:process.env.CLAUDE_CONFIG_DIR,remote:process.env.CLAUDE_CODE_REMOTE,remoteType:process.env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE,token:process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN,epoch:process.env.CLAUDE_CODE_WORKER_EPOCH,ccr:process.env.CLAUDE_CODE_USE_CCR_V2,api:process.env.ANTHROPIC_BASE_URL}))",
    ].join('\n'))
    const cap1=join(base,'byoc.json')
    const cap2=join(base,'bridge.json')
    const conf=join(base,'state')
    mkdirSync(conf,{recursive:true})
    const url='https://session.example.test/v1/code/sessions/abc_123'
    const spawnBase={
      execPath:process.execPath,scriptArgs:[script],verbose:false,sandbox:false,
      onDebug:()=>{},
    }
    const byoc=createSessionSpawner({...spawnBase,env:{...process.env,TEST_CAPTURE_PATH:cap1},
      runnerRuntime:{apiBaseUrl:'https://session.example.test',configDir:conf}})
    const result=byoc.spawn({sessionId:'abc_123',sdkUrl:url,accessToken:'single-session-token',
      useCcrV2:true,workerEpoch:7},base)
    expect(await result.done).toBe('completed')
    const first=JSON.parse(readFileSync(cap1,'utf8'))
    expect(first.args).toContain('--resume='+url)
    expect(first.args).not.toContain('--session-id')
    expect(first.kind).toBe('byoc')
    expect(first.remote).toBe('true')
    expect(first.remoteType).toBe('self_hosted')
    expect(first.configDir).toBe(conf)
    expect(first.token).toBe('single-session-token')
    expect(first.epoch).toBe('7')
    expect(first.ccr).toBe('1')
    expect(first.api).toBe('https://session.example.test')

    const bridge=createSessionSpawner({...spawnBase,env:{...process.env,TEST_CAPTURE_PATH:cap2}})
    const other=bridge.spawn({sessionId:'abc_123',sdkUrl:url,accessToken:'bridge-token'},base)
    expect(await other.done).toBe('completed')
    const second=JSON.parse(readFileSync(cap2,'utf8'))
    expect(second.kind).toBe('bridge')
    expect(second.args).toContain('--session-id')
    expect(second.args).toContain('abc_123')
    expect(second.args.some((a:string)=>a.startsWith('--resume='))).toBe(false)
  }finally{rmSync(base,{recursive:true,force:true})}
})
