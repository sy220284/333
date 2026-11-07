import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRuntime317 } from '../src/entrypoints/sdk/sessionRuntime317.js'

const fixture = "\nimport { createInterface } from 'node:readline'\nimport { writeFileSync } from 'node:fs'\nconst send = frame => process.stdout.write(JSON.stringify(frame)+'\\n')\ncreateInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{\n try{\n  const frame=JSON.parse(line)\n  if(frame.type==='control_request' && frame.request.subtype==='initialize'){\n   send({type:'control_response',response:{subtype:'success',request_id:frame.request_id,response:{\n    models:[],agents:[],commands:[],output_style:'default',available_output_styles:[],account:{},hook_on_failure_supported:true,hooks_applied:true\n   }}})\n  }else if(frame.type==='user'){\n   const form=frame.message.content==='form'\n   send({type:'control_request',request_id:'original-host-request',request:form\n    ? {subtype:'elicitation',mcp_server_name:'offline-mcp',message:'填写参数',mode:'form',title:'本地服务',\n       requested_schema:{type:'object',properties:{name:{type:'string'}}}}\n    : {subtype:'request_user_dialog',dialog_kind:'choose',payload:{choices:['A','B']},tool_use_id:'use-demo'}})\n  }else if(frame.type==='control_response'&&frame.response.request_id==='original-host-request'){\n   writeFileSync(process.env.SDK_ORIGINAL_HOST_REPLY_FILE,JSON.stringify(frame.response))\n  }\n }catch(error){console.error(error);process.exitCode=1}\n})\n"

async function readReply(path:string){
  const deadline=Date.now()+6000
  while(Date.now()<deadline){
    try{return JSON.parse(await readFile(path,'utf8')) as {subtype:string;response:Record<string,unknown>}}
    catch(error){
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error
      await new Promise(resolve=>setTimeout(resolve,20))
    }
  }
  throw new Error('原版 SDK 宿主控制请求未取得回执')
}

for(const item of [
  {kind:'form',name:'官方317 onElicitation保留字段映射、确认结果和专属回调优先级'},
  {kind:'dialog',name:'官方317 onUserDialog保留对话种类、输入载荷和工具调用身份'},
]){
  test(item.name,{timeout:30000},async()=>{
    const root=await mkdtemp(join(tmpdir(),'sdk-original-host-'))
    const cli=join(root,'fake-cli.mjs'),responseFile=join(root,'response.json')
    await writeFile(cli,fixture)
    const seen:unknown[]=[]
    const session=createSessionRuntime317({
      model:'mock-model',cwd:root,executable:'node',pathToClaudeCodeExecutable:cli,
      env:{...process.env,SDK_ORIGINAL_HOST_REPLY_FILE:responseFile},
      onControlRequest:async()=>{throw new Error('专用回调应该先于通用宿主回调')},
      onElicitation:async(request,context)=>{
        seen.push({request,requestId:context.requestId,aborted:context.signal.aborted})
        return {action:'accept',content:{name:'原版字段'}}
      },
      onUserDialog:async(request,context)=>{
        seen.push({request,requestId:context.requestId,aborted:context.signal.aborted})
        return {selection:'B'}
      },
    })
    try{
      await session.initialization
      await session.send(item.kind)
      const reply=await readReply(responseFile)
      expect(reply.subtype).toBe('success')
      expect(reply.response).toEqual(item.kind==='form'
        ? {action:'accept',content:{name:'原版字段'}}:{selection:'B'})
      expect(seen).toHaveLength(1)
      expect(seen[0]).toMatchObject({
        requestId:'original-host-request',aborted:false,
        request:item.kind==='form'
          ? {serverName:'offline-mcp',mode:'form',title:'本地服务'}
          : {dialogKind:'choose',toolUseID:'use-demo',payload:{choices:['A','B']}},
      })
    }finally{
      await session.closeAndWait()
      await rm(root,{recursive:true,force:true})
    }
  })
}
