import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const model = 'claude-sonnet-4-6'
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
function reply() {
  return [
    sse('message_start', {type:'message_start',message:{
      id:'msg_upgrade',type:'message',role:'assistant',model,content:[],
      stop_reason:null,stop_sequence:null,
      usage:{input_tokens:3,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0},
    }}),
    sse('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}),
    sse('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'UPGRADE_OK'}}),
    sse('content_block_stop',{type:'content_block_stop',index:0}),
    sse('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:5}}),
    sse('message_stop',{type:'message_stop'}),
  ].join('')
}

async function spawnCli(command, args, cwd, env, flags) {
  const child = spawn(command, [...args,
    '--bare','--print','Reply UPGRADE_OK','--model',model,
    '--tools', ...flags.tools,
    ...flags.args, '--output-format','json','--max-turns','1',
  ], {cwd, env, stdio:['ignore','pipe','pipe']})
  let stdout='', stderr=''
  child.stdout.on('data',x=>stdout+=x)
  child.stderr.on('data',x=>stderr+=x)
  const timer=setTimeout(()=>child.kill('SIGKILL'),20000)
  try {
    const [exit]=await new Promise((res,rej)=>{
      child.once('error',rej)
      child.once('close',(code,signal)=>res([code,signal]))
    })
    return {exit,stdout,stderr}
  } finally {clearTimeout(timer)}
}

test('2.1.310 restricted mode enforces default deny and explicit tool override', {timeout:90000}, async()=>{
  const cwd=mkdtempSync(join(root,'.rebuild','333-restricted-'))
  const recorded=[]
  const server=createServer(async(req,res)=>{
    if(req.method==='HEAD'){res.writeHead(200);res.end();return}
    if(!req.url.startsWith('/v1/messages')){res.writeHead(404);res.end();return}
    let raw='';for await (const x of req)raw+=x
    const body=JSON.parse(raw)
    recorded.push((body.tools??[]).map(x=>x.name).sort())
    res.writeHead(200,{'content-type':'text/event-stream'})
    res.end(reply())
  })
  try {
    mkdirSync(join(cwd,'.claude'),{recursive:true})
    writeFileSync(join(cwd,'.claude','settings.json'),JSON.stringify({permissions:{deny:['Read']}}))
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok))
    const env={...process.env,
      ANTHROPIC_API_KEY:'local-fake-333-key',
      ANTHROPIC_BASE_URL:`http://127.0.0.1:${server.address().port}`,
      DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',
      NO_PROXY:'127.0.0.1,localhost',HTTP_PROXY:'',HTTPS_PROXY:'',
      HOME:cwd,USERPROFILE:cwd,XDG_CONFIG_HOME:cwd,XDG_CACHE_HOME:cwd,
    }
    const targets=[['rebuilt','bun',[join(root,'dist/cli.js')]]]
    if(process.env.CLAUDE_2310_X64)targets.push(['native',process.env.CLAUDE_2310_X64,[]])
    const seen=new Map()
    for(const [name,cmd,execArgs] of targets){
      for(const [scenario,tools,extra] of [
        ['restricted-default',['default'],['--restricted']],
        ['restricted-explicit',['Bash,Read'],['--restricted']],
        ['safe-mode',['default'],['--safe-mode']],
      ]){
        const before=recorded.length
        const result=await spawnCli(cmd,execArgs,cwd,env,{tools,args:extra})
        assert.equal(result.exit,0,`${name} ${scenario} failed ${result.stderr.slice(-900)}`)
        assert.equal(recorded.length,before+1,`${name} ${scenario} did not make one API request`)
        const exposed=recorded.at(-1)
        if(scenario==='restricted-default'){
          assert.ok(!exposed.includes('Bash'),`${name}: default restricted leaked Bash`)
          assert.ok(exposed.includes('Read'),`${name}: project settings should be ignored`)
        }
        if(scenario==='restricted-explicit')assert.ok(exposed.includes('Bash'),`${name}: explicitly listed Bash missing`)
        if(scenario==='safe-mode'){
          assert.ok(!exposed.includes('Read'),`${name}: safe-mode discarded an existing explicit deny rule`)
          assert.ok(exposed.includes('Bash'),`${name}: safe-mode removed a built-in tool`)
        }
        if(!seen.has(scenario))seen.set(scenario,exposed)
        else assert.deepEqual(exposed,seen.get(scenario),`2.1.310 parity in ${scenario}`)
      }
      const blocked=await spawnCli(cmd,execArgs,cwd,env,{tools:['default'],args:['--restricted','--permission-mode','bypassPermissions']})
      assert.notEqual(blocked.exit,0,`${name}: restricted must reject bypassPermissions`)
    }
  } finally {
    await new Promise(resolveClose=>server.close(resolveClose))
    rmSync(cwd,{recursive:true,force:true})
  }
})
