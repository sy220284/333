#!/usr/bin/env node
// 2.1.310 ToolSearch runtime parity: real CLI, local fake model API, no credentials.
import { createHash } from 'node:crypto'
import { createReadStream, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const args = process.argv.slice(2)
if (args.length % 2) throw Error('Expected --key value pairs')
const opt = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[2*i], args[2*i+1]]))
if (!opt['--reference'] || !opt['--report']) throw Error('Missing --reference / --report')
const officialSha = 'b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56'
const digest = createHash('sha256')
for await (const part of createReadStream(opt['--reference'])) digest.update(part)
if (digest.digest('hex') !== officialSha) throw Error('Target binary checksum mismatch')
const names = ['Monitor','Workflow','VerifyPlanExecution','Snip','TaskOutput','WebBrowser','SendUserFile','Bash','Read','ListAgents']
const foundOnTarget = ['Monitor','Workflow','Bash','Read','ListAgents']
const absentOnTarget = names.filter(n => !foundOnTarget.includes(n))
const toolUseId = 'toolu_01_333_source_gap_check'
const frame = (event, data) => 'event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'
function sse(model, toolCall) {
  const chunks = [
    ['message_start',{type:'message_start',message:{id:toolCall?'msg_01_gap_search':'msg_02_gap_finish',type:'message',role:'assistant',model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:200,output_tokens:20,cache_creation_input_tokens:0,cache_read_input_tokens:0}}}],
    ['content_block_start',{type:'content_block_start',index:0,content_block:toolCall?{type:'tool_use',id:toolUseId,name:'ToolSearch',input:{}}:{type:'text',text:''}}],
    ['content_block_delta',{type:'content_block_delta',index:0,delta:toolCall?{type:'input_json_delta',partial_json:JSON.stringify({query:'select:'+names.join(',')})}:{type:'text_delta',text:'DISCOVERY_COMPLETE'}}],
    ['content_block_stop',{type:'content_block_stop',index:0}],
    ['message_delta',{type:'message_delta',delta:{stop_reason:toolCall?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:20}}],
    ['message_stop',{type:'message_stop'}],
  ]
  return chunks.map(([e,d])=>frame(e,d)).join('')
}
async function probe(exe) {
  const home = mkdtempSync(join(tmpdir(),'333-toolsearch-'))
  const requests = []
  const server = createServer(async(req,res)=>{
    if(req.method==='HEAD'){res.writeHead(200);res.end();return}
    if(req.method!=='POST'||!req.url?.startsWith('/v1/messages')){res.writeHead(404);res.end();return}
    let raw='';for await(const part of req)raw+=part
    const body=JSON.parse(raw), answer=sse(body.model,requests.length===0)
    requests.push({tools:(body.tools??[]).map(t=>t.name),messages:body.messages??[]})
    res.writeHead(200,{'content-type':'text/event-stream','content-length':String(Buffer.byteLength(answer))});res.end(answer)
  })
  try{
    server.listen(0,'127.0.0.1');await once(server,'listening')
    const env={}
    for(const [k,v] of Object.entries(process.env))if(!/CLAUDE|ANTHROPIC|TOKEN|SECRET|PASSWORD|API_KEY|AWS_|GOOGLE_|OPENAI_|GITHUB_/i.test(k))env[k]=v
    Object.assign(env,{HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:home,XDG_CACHE_HOME:home,ANTHROPIC_API_KEY:'local-only-test-key',ANTHROPIC_BASE_URL:'http://127.0.0.1:'+server.address().port,DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',NO_PROXY:'127.0.0.1,localhost',HTTP_PROXY:'',HTTPS_PROXY:''})
    const child=spawn(resolve(exe),['--print','--output-format','json','--max-turns','3','--no-session-persistence','Check tools'],{cwd:home,env,stdio:['ignore','pipe','pipe']})
    let stdout='',stderr=''
    child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x)
    const timer=setTimeout(()=>child.kill('SIGKILL'),24000)
    let exitCode,signal
    try{[exitCode,signal]=await once(child,'close')}finally{clearTimeout(timer)}
    const refs=new Set()
    for(const msg of requests[1]?.messages??[]){
      if(msg.role!=='user'||!Array.isArray(msg.content))continue
      for(const result of msg.content){
        if(result.type!=='tool_result'||result.tool_use_id!==toolUseId)continue
        for(const part of Array.isArray(result.content)?result.content:[])if(part.type==='tool_reference'&&typeof part.tool_name==='string')refs.add(part.tool_name)
      }
    }
    let parsed
    try{parsed=JSON.parse(stdout)}catch{parsed={result:stdout.slice(-400)}}
    return {exitCode,signal,calls:requests.length,initialTools:requests[0]?.tools??[],discovered:[...refs].sort(),result:parsed.result,isError:parsed.is_error,stderr:stderr.slice(-300)}
  }finally{
    await new Promise(done=>server.close(done))
    rmSync(home,{recursive:true,force:true})
  }
}
const reference=await probe(opt['--reference'])
const candidate=opt['--candidate']?await probe(opt['--candidate']):null
const referencePass=reference.exitCode===0&&reference.calls===2&&reference.result==='DISCOVERY_COMPLETE'&&foundOnTarget.every(n=>reference.discovered.includes(n))&&absentOnTarget.every(n=>!reference.discovered.includes(n))
const candidateMatches=candidate?candidate.exitCode===reference.exitCode&&candidate.calls===reference.calls&&candidate.result===reference.result&&JSON.stringify(candidate.discovered)===JSON.stringify(reference.discovered):null
const report={officialSha,names,reference,candidate,referencePass,candidateMatches,scope:'ordinary CLI --print ToolSearch with isolated model API'}
mkdirSync(dirname(resolve(opt['--report'])),{recursive:true})
writeFileSync(resolve(opt['--report']),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({referencePass,candidateMatches,referenceDiscovered:reference.discovered,candidateDiscovered:candidate?.discovered??null}))
if(!referencePass||(candidate&&!candidateMatches&&opt['--allow-candidate-diff']!=='true'))process.exitCode=1
