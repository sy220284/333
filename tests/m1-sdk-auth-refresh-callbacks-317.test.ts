import { expect,test } from 'bun:test'
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRuntime317 } from '../src/entrypoints/sdk/sessionRuntime317.js'

const fixture="\nimport { createInterface } from 'node:readline'\nimport { writeFileSync } from 'node:fs'\nconst send=frame=>process.stdout.write(JSON.stringify(frame)+'\\n')\nconst reader=createInterface({input:process.stdin,crlfDelay:Infinity})\nreader.on('line',line=>{\n try{\n  const frame=JSON.parse(line)\n  if(frame.type==='control_request'&&frame.request.subtype==='initialize'){\n   send({type:'control_response',response:{subtype:'success',request_id:frame.request_id,response:{\n    models:[],agents:[],commands:[],account:{},output_style:'default',available_output_styles:[],hook_on_failure_supported:true,hooks_applied:true\n   }}})\n  }else if(frame.type==='user'){\n   const oauth=frame.message.content.startsWith('oauth')\n   send({type:'control_request',request_id:'refresh-317',request:oauth\n    ? {subtype:'oauth_token_refresh',kind:'normal'}\n    : {subtype:'host_auth_token_refresh'}})\n  }else if(frame.type==='control_response'&&frame.response.request_id==='refresh-317'){\n   writeFileSync(process.env.SDK_AUTH_REFRESH_REPLY_PATH,JSON.stringify(frame.response))\n  }\n }catch(error){console.error(error);process.exitCode=1}\n})\n"
async function reply(path:string){
 const deadline=Date.now()+7000
 while(Date.now()<deadline){
  try{return JSON.parse(await readFile(path,'utf8')) as {
    subtype:'success'|'error';response?:Record<string,unknown>;error?:string
  }}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error
   await new Promise(resolve=>setTimeout(resolve,20))
  }
 }
 throw new Error('SDK没有回传认证结果')
}
const cases=[
 {kind:'oauth-success',expected:{accessToken:'token-317'}},
 {kind:'oauth-declined',expected:{accessToken:null,reason:'signed_out'}},
 {kind:'oauth-invalid-reason',expected:{accessToken:null}},
 {kind:'host-string',expected:{authToken:'host-token-317'}},
 {kind:'host-object',expected:{authToken:'host-token',refreshAfter:120}},
 {kind:'host-null',expected:{authToken:null}},
 {kind:'oauth-missing',error:'getOAuthToken callback is not provided.'},
 {kind:'host-missing',error:'getHostAuthToken callback is not provided.'},
] as const
for(const testcase of cases){
 test(`官方317认证回调保留有效结果、拒绝原因和明确异常 ${testcase.kind}`,{timeout:30000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'sdk-auth-refresh-'))
  const cli=join(root,'fixture.mjs'),file=join(root,'response.json')
  await writeFile(cli,fixture)
  let invoked=0
  const runtime=createSessionRuntime317({
   model:'mock-model',cwd:root,executable:'node',pathToClaudeCodeExecutable:cli,
   env:{...process.env,SDK_AUTH_REFRESH_REPLY_PATH:file},
   ...(!testcase.kind.endsWith('-missing') && {onControlRequest:async()=>{
     throw new Error('原版认证回调必须先于通用宿主回调执行')
   }}),
   ...(testcase.kind!=='oauth-missing'&&testcase.kind!=='host-missing'&&{
    getOAuthToken:async(options:{
      signal:AbortSignal;kind?:unknown;onDecline:(reason:string)=>void
    })=>{
      invoked++
      expect(options.signal.aborted).toBe(false)
      expect(options.kind).toBe('normal')
      if(testcase.kind==='oauth-declined'){options.onDecline('signed_out');return null}
      if(testcase.kind==='oauth-invalid-reason'){options.onDecline('invalid');return null}
      return 'token-317'
    },
    getHostAuthToken:async()=>{
      invoked++
      if(testcase.kind==='host-object')return {authToken:'host-token',refreshAfter:120}
      if(testcase.kind==='host-null')return null
      return 'host-token-317'
    },
   }),
  })
  try{
   await runtime.initialization
   await runtime.send(testcase.kind)
   const actual=await reply(file)
   if('error' in testcase){
    expect(actual.subtype).toBe('error')
    expect(actual.error).toContain(testcase.error)
    expect(invoked).toBe(0)
   }else{
    expect(actual.subtype).toBe('success')
    expect(actual.response).toEqual(testcase.expected)
    expect(invoked).toBe(1)
   }
  }finally{await runtime.closeAndWait();await rm(root,{recursive:true,force:true})}
 })
}
