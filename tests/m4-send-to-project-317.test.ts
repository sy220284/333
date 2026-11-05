import {test,expect} from 'bun:test'
import {createProjectsClient317,verifyPersonalProject317,ProjectApiError317} from
  '../src/commands/send-to-project/projectApi317.ts'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

const base='https://api.example.test'
const auth={baseUrl:base,accessToken:'secret',organizationUuid:'org'}
function response(value:unknown,status=200){
 return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
}
const own={id:'chan_personal',name:'My Project',visibility:'private',
  membership:{role:'owner'}}
function api(handler:(method:string,path:string,body:any)=>Response|Promise<Response>){
 const calls:Array<{method:string;path:string;body:any;headers:Headers}>=[]
 const client=createProjectsClient317({...auth,
   fetchImpl:(async(url,init)=>{
     const method=init?.method||'GET'
     const path=new URL(String(url)).pathname+new URL(String(url)).search
     const body=init?.body?JSON.parse(String(init.body)):undefined
     calls.push({method,path,body,headers:new Headers(init?.headers)})
     return await handler(method,path,body)
   }) as typeof fetch,
 })
 return {client,calls}
}
test('317 private owner requirement rejects shared, archived, non-owner and invalid IDs',()=>{
 expect(verifyPersonalProject317({channel:own}).id).toBe('chan_personal')
 for(const v of [{...own,visibility:'public'},{...own,membership:{role:'member'}},
   {...own,archived_at:'2026-01-01'},{...own,visibility:undefined},
   {...own,id:'../../etc/passwd'}]){
   expect(()=>verifyPersonalProject317(v)).toThrow(ProjectApiError317)
 }
})
test('317 project discovery uses authorized paginated channels',async()=>{
 const {client,calls}=api((_m,path)=>{
   if(!path.includes('cursor='))return response({data:[own],next_cursor:'next'})
   return response({data:[{...own,id:'chan_second',name:'Other'}],next_cursor:null})
 })
 const results=await client.list()
 expect(results.map(x=>x.id)).toEqual(['chan_personal','chan_second'])
 expect(calls[0]?.path).toContain('scope=joined')
 expect(calls[0]?.headers.get('authorization')).toBe('Bearer secret')
 expect(calls[0]?.headers.get('x-organization-uuid')).toBe('org')
 expect(calls[0]?.headers.get('anthropic-version')).toBe('2023-06-01')
})
test('317 message request retains idempotency key and validates server receipt',async()=>{
 const {client,calls}=api(()=>response({
   message_id:'cmsg_one',thread_root_id:'cmsg_one',deduplicated:true,
 }))
 const receipt=await client.send('chan_personal','Hello Project','unique123456')
 expect(receipt.messageId).toBe('cmsg_one')
 expect(receipt.deduplicated).toBe(true)
 expect(calls[0]?.body).toEqual({body:'Hello Project',client_message_id:'unique123456'})
 expect(calls[0]?.method).toBe('POST')
})
test('317 malformed send receipt is marked uncertain and cannot be called a success',async()=>{
 const {client}=api(()=>response({message_id:'cmsg_one'}))
 await expect(client.send('chan_personal','content','unique123456'))
   .rejects.toMatchObject({mayHaveLanded:true})
})
test('317 failed owner verification prevents any message write',async()=>{
 const {client,calls}=api(()=>response({channel:{...own,membership:{role:'member'}}}))
 await expect(client.getOwned('chan_personal')).rejects.toThrow('does not own')
 expect(calls.map(c=>c.method)).toEqual(['GET'])
})
test('317 creation sends private visibility, rejects ambiguous creation response',async()=>{
 const {client,calls}=api(()=>response({channel:own}))
 expect((await client.create('My Project')).id).toBe('chan_personal')
 expect(calls[0]?.body.visibility).toBe('private')
 const ambiguous=api(()=>response({}))
 await expect(ambiguous.client.create('My Project'))
   .rejects.toMatchObject({mayHaveLanded:true})
})
test('317 project memory precondition preserves an existing file',async()=>{
 const {client,calls}=api(()=>response({error:{message:'exists'}},409))
 expect(await client.memory('chan_personal','/PROJECT_BRIEF_CLAUDE_CODE.md','brief'))
   .toBe('existing')
 expect(calls[0]?.body.precondition).toEqual({type:'not_exists'})
})
test('317 setup proposal uses official endpoint and client id',async()=>{
 const {client,calls}=api(()=>response({message:{id:'cmsg_setup'},
   already_submitted:true,dropped:[]}))
 const result=await client.submitSetup('chan_personal',{summary:'test'},
   'cse_session','unique123456')
 expect(result).toEqual({kind:'submitted',alreadySubmitted:true,dropped:[]})
 expect(calls[0]?.path).toBe('/v1/code/channels/chan_personal/setup-proposals')
 expect(calls[0]?.body.client_request_id).toBe('unique123456')
})
test('317 coordinator handoff validates JSON RPC receipt',async()=>{
 const {client,calls}=api(()=>response({jsonrpc:'2.0',id:1,
   result:{content:[{type:'text',text:'ok'}]}}))
 await client.handoff('cse_test','summary')
 expect(calls[0]?.path).toBe('/v1/code/mcp/meta')
 expect(calls[0]?.body.params.name).toBe('send_message')
 const invalid=api(()=>response({jsonrpc:'2.0',id:1,error:{code:-32001,message:'refused'}}))
 await expect(invalid.client.handoff('cse_test','summary'))
   .rejects.toMatchObject({mayHaveLanded:true})
})
test('317 local command is registered for real TUI with lazy TSX',()=>{
 const commands=readFileSync(join(import.meta.dir,'../src/commands.ts'),'utf8')
 const index=readFileSync(join(import.meta.dir,
   '../src/commands/send-to-project/index.ts'),'utf8')
 expect(commands).toContain('sendToProject,')
 expect(index).toContain("name: 'send-to-project'")
 expect(index).toContain("import('./send-to-project.js')")
})

test('317 coordinator may return a transport-level success with a rejected tool result',async()=>{
  const {client}=api(()=>response({
    jsonrpc:'2.0',id:1,
    result:{isError:true,content:[{type:'text',text:'not delivered'}]},
  }))
  await expect(client.handoff('cse_test','brief'))
    .rejects.toMatchObject({mayHaveLanded:true})
})
test('317 user-facing command requires Remote Control before cloud handoff',()=>{
  const source=readFileSync(join(import.meta.dir,
    '../src/commands/send-to-project/send-to-project.tsx'),'utf8')
  expect(source).toContain('if(!context.getAppState().replBridgeSessionId)')
  expect(source).toContain('请先运行 /remote-control')
  expect(source).toContain("setStep('confirm')")
})
