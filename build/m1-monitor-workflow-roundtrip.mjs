#!/usr/bin/env node
// Exercise real Monitor/Workflow tool use on native 2.1.310 and rebuilt CLI.
// The fake model API requests only a shell printf and a pure, no-agent workflow.
import {createHash} from 'node:crypto'
import {createReadStream,mkdtempSync,rmSync,mkdirSync,writeFileSync,readdirSync,readFileSync,existsSync} from 'node:fs'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
const argv=process.argv.slice(2)
if(argv.length%2)throw Error('Expected --key value pairs')
const opt=Object.fromEntries(Array.from({length:argv.length/2},(_,i)=>[argv[i*2],argv[i*2+1]]))
if(!opt['--reference']||!opt['--candidate']||!opt['--report'])throw Error('Missing --reference, --candidate, --report')
const hash=createHash('sha256')
for await(const block of createReadStream(opt['--reference']))hash.update(block)
if(hash.digest('hex')!=='b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56')
 throw Error('Official 2.1.310 Linux x64 SHA-256 mismatch')
const script=["export const meta={name:'probe-return',description:'Pure workflow',phases:[{title:'Run'}]}",
 "phase('Run')","return {answer:42}"].join('\n')
const bodyFor={
 Monitor:{description:'Probe one command',command:"printf 'OUT_333\\n'; printf 'ERR_333\\n' >&2",timeout_ms:1000},
 Workflow:{script},
}
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
function response(model,name,input,n){
 const tool=!!name,id=`toolu_01_333_roundtrip_${n}`
 const pairs=[
 ['message_start',{type:'message_start',message:{id:`msg_01_roundtrip_${n}`,type:'message',role:'assistant',model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:150,output_tokens:20,cache_creation_input_tokens:0,cache_read_input_tokens:0}}}],
 ['content_block_start',{type:'content_block_start',index:0,content_block:tool?{type:'tool_use',id,name,input:{}}:{type:'text',text:''}}],
 ['content_block_delta',{type:'content_block_delta',index:0,delta:tool?{type:'input_json_delta',partial_json:JSON.stringify(input)}:{type:'text_delta',text:'ROUNDTRIP_COMPLETE'}}],
 ['content_block_stop',{type:'content_block_stop',index:0}],
 ['message_delta',{type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:20}}],
 ['message_stop',{type:'message_stop'}],
 ]
 return pairs.map(([e,d])=>frame(e,d)).join('')
}
function collectWorkflowRuns(home){
 const root=join(home,'.claude','projects')
 if(!existsSync(root))return []
 const items=[]
 function visit(directory,depth){
  if(depth>7)return
  for(const entry of readdirSync(directory,{withFileTypes:true})){
   const path=join(directory,entry.name)
   if(entry.isDirectory()){visit(path,depth+1);continue}
   if(!entry.isFile()||!/^wf_[0-9a-f]{8}-[0-9a-f]{3}\.json$/.test(entry.name))continue
   if(directory.split(/[\/\\]/).at(-1)!=='workflows')continue
   const data=JSON.parse(readFileSync(path,'utf8'))
   items.push({runId:data.runId,status:data.status,answer:data.result?.answer,
    workflowName:data.workflowName,scriptPath:data.scriptPath})
  }
 }
 visit(root,0)
 return items
}
async function run(exe,toolName){
 const home=mkdtempSync(join(tmpdir(),'333-roundtrip-'))
 const requests=[]
 const server=createServer(async(req,res)=>{
  if(req.method==='HEAD'){res.writeHead(200);res.end();return}
  if(req.method!=='POST'||!req.url?.startsWith('/v1/messages')){res.writeHead(404);res.end();return}
  let raw='';for await(const chunk of req)raw+=chunk
  const body=JSON.parse(raw),n=requests.length
  requests.push({tools:(body.tools??[]).map(t=>t.name),messages:body.messages??[]})
  const packet=n===0?response(body.model,'ToolSearch',{query:'select:Monitor,Workflow'},n):
    n===1?response(body.model,toolName,bodyFor[toolName],n):response(body.model,null,null,n)
  res.writeHead(200,{'content-type':'text/event-stream','content-length':String(Buffer.byteLength(packet))})
  res.end(packet)
 })
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const env={}
  for(const [k,v] of Object.entries(process.env))
   if(!/CLAUDE|ANTHROPIC|TOKEN|SECRET|PASSWORD|API_KEY|AWS_|GOOGLE_|OPENAI_|GITHUB_|PROXY/i.test(k))env[k]=v
  Object.assign(env,{HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:home,XDG_CACHE_HOME:home,
   ANTHROPIC_API_KEY:'local-roundtrip-only-key',ANTHROPIC_BASE_URL:`http://127.0.0.1:${server.address().port}`,
   DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',
   NO_PROXY:'127.0.0.1,localhost',HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:''})
  const child=spawn(resolve(exe),['--print','--output-format','json','--max-turns','5',
   '--no-session-persistence','--dangerously-skip-permissions','Run a local tool check'],{cwd:home,env,stdio:['ignore','pipe','pipe']})
  let output='',error=''
  child.stdout.on('data',x=>output+=x)
  child.stderr.on('data',x=>error+=x)
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000)
  let exit,signal
  try{[exit,signal]=await once(child,'close')}finally{clearTimeout(timer)}
  const resultBlocks=[]
  for(const request of requests.slice(1))for(const message of request.messages)
   if(message.role==='user'&&Array.isArray(message.content))
    for(const block of message.content)if(block.type==='tool_result')resultBlocks.push(block)
  const own=resultBlocks.find(b=>b.tool_use_id==='toolu_01_333_roundtrip_1')
  const serialized=typeof own?.content==='string'?own.content:JSON.stringify(own?.content??'')
  // Check the actual next model request instead of just the tool's "started" receipt.
  // Only stdout becomes a Monitor event; stderr must remain available in the task log.
  const eventNotices=[]
  for(const request of requests)for(const message of request.messages??[]){
   if(message?.role!=='user')continue
   const content=typeof message.content==='string'?message.content:
     Array.isArray(message.content)?message.content.filter(x=>x?.type==='text').map(x=>x.text??'').join('\n'):''
   for(const match of content.matchAll(/<task-notification>[\s\S]*?<\/task-notification>/g))eventNotices.push(match[0])
  }
  const events=eventNotices.flatMap(notice=>[...notice.matchAll(/<event>([\s\S]*?)<\/event>/g)].map(m=>m[1]))
  const terminalStatuses=eventNotices.flatMap(notice=>[...notice.matchAll(/<status>([\s\S]*?)<\/status>/g)].map(m=>m[1]))
  const paths=eventNotices.flatMap(notice=>[...notice.matchAll(/<output-file>([\s\S]*?)<\/output-file>/g)].map(m=>m[1]))
  const readableFiles=paths.filter(path=>existsSync(path)).map(path=>({path,content:readFileSync(path,'utf8')}))
  const monitorOutputPersisted=readableFiles.some(x=>x.content.includes('OUT_333')&&x.content.includes('ERR_333'))
  const monitorEventsMatch=events.length===1&&events[0]==='OUT_333'&&terminalStatuses.includes('completed')
  const saved=toolName==='Workflow'?collectWorkflowRuns(home):[]
  const persisted=saved.some(item=>item.status==='completed'&&item.answer===42&&item.workflowName==='probe-return')
  const ok=exit===0&&requests.length>=3&&
   (toolName==='Workflow'?serialized.includes('Workflow launched in background')&&
      serialized.includes('Run ID: wf_')&&serialized.includes('Script file:')&&persisted:
    serialized.includes('Monitor started')&&serialized.includes('task ')&&monitorEventsMatch&&monitorOutputPersisted)
  return {tool:toolName,ok,exit,signal,calls:requests.length,
   ...(toolName==='Monitor'?{monitorEvents:events,monitorStatuses:terminalStatuses,monitorOutputPersisted,monitorEventsMatch,monitorNotifications:eventNotices.map(x=>x.slice(0,650))}:{}),
   ...(toolName==='Workflow'?{savedRuns:saved}:{}),
   toolResponse:serialized.slice(0,2000),stdout:output.slice(-350),stderr:error.slice(-350)}
 }finally{
  await new Promise(done=>server.close(done))
  rmSync(home,{recursive:true,force:true})
 }
}
const report={}
for(const name of ['Monitor','Workflow']){
 report[name]={official:await run(opt['--reference'],name),candidate:await run(opt['--candidate'],name)}
}
mkdirSync(dirname(resolve(opt['--report'])),{recursive:true})
writeFileSync(resolve(opt['--report']),`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([k,v])=>[k,{
 official:v.official.ok,candidate:v.candidate.ok,officialCalls:v.official.calls,candidateCalls:v.candidate.calls
}]))))
if(Object.values(report).some(v=>!v.official.ok||!v.candidate.ok))process.exitCode=1
