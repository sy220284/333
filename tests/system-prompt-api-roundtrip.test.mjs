import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const answer='M1_SYSTEM_PROMPT_API_ROUNDTRIP_OK'
const model='claude-sonnet-4-6'
const frame=(type,data)=>`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
function mockResponse() {
  const message={id:'msg_m1_snapshot',type:'message',role:'assistant',model,
    content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}
  return frame('message_start',{type:'message_start',message})+
    frame('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}})+
    frame('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:answer}})+
    frame('content_block_stop',{type:'content_block_stop',index:0})+
    frame('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:8}})+
    frame('message_stop',{type:'message_stop'})
}
function invoke(binary,argv,env,cwd) {
  return new Promise((yes,no)=>{
    const child=spawn(binary,argv,{env,cwd,stdio:['ignore','pipe','pipe']})
    let out='',err=''
    const timeout=setTimeout(()=>child.kill('SIGKILL'),30000)
    child.stdout.on('data',chunk=>{out+=chunk.toString()})
    child.stderr.on('data',chunk=>{err+=chunk.toString()})
    child.once('error',e=>{clearTimeout(timeout);no(e)})
    child.once('close',(code,signal)=>{
      clearTimeout(timeout);yes({code,signal,out,err})
    })
  })
}

test('running CLI sends separated prompt and persists the actual model prompt', async()=>{
  const temp=mkdtempSync(join(tmpdir(),'m1-real-prompt-'))
  const home=join(temp,'home'),config=join(home,'.claude')
  mkdirSync(config,{recursive:true})
  let payload
  const srv=createServer((req,res)=>{
    if(req.method!=='POST'||!req.url?.startsWith('/v1/messages')){
      res.writeHead(404);res.end();return
    }
    let input=''
    req.on('data',chunk=>{input+=chunk.toString()})
    req.on('end',()=>{
      try{
        payload=JSON.parse(input)
        res.writeHead(200,{'content-type':'text/event-stream'})
        res.end(mockResponse())
      }catch{res.writeHead(500);res.end('Local fixture processing failed')}
    })
  })
  try {
    await new Promise(ok=>srv.listen(0,'127.0.0.1',ok))
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>
      !/ANTHROPIC|CLAUDE|AWS_|GOOGLE_|OPENAI_|TOKEN|SECRET|API_KEY/i.test(key)))
    Object.assign(env,{
      HOME:home,CLAUDE_CONFIG_DIR:config,TERM:'dumb',CI:'1',NO_COLOR:'1',
      ANTHROPIC_BASE_URL:`http://127.0.0.1:${srv.address().port}`,
      ANTHROPIC_API_KEY:'sk-ant-api03-local-fixture-only',
      CLAUDE_CODE_SYSTEM_PROMPT_SNAPSHOT:'on',
      CLAUDE_CODE_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS:'1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_TELEMETRY:'1',
    })
    const exec=await invoke('bun',[resolve('dist/cli.js'),'--bare','--print',
      '--output-format','json','--model',model,'--max-turns','1',
      'Local offline prompt snapshot test'],env,temp)
    assert.equal(exec.code,0,`CLI ${exec.code} stderr: ${exec.err.slice(-600)} stdout: ${exec.out.slice(-600)}`)
    const result=JSON.parse(exec.out.trim())
    assert.equal(result.type,'result')
    assert.equal(result.terminal_reason,'completed')
    assert.match(result.result,/M1_SYSTEM_PROMPT_API_ROUNDTRIP_OK/)
    assert.ok(payload,'Missing localhost model request')
    assert.equal(payload.model,model)
    assert.ok(Array.isArray(payload.system)&&payload.system.length>0)
    assert.ok(Array.isArray(payload.messages))
    assert.ok(!JSON.stringify(payload.system).includes('__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'))
    // 2.1.310 x64 uses no dynamic_system_context wrapper in a --bare session.\n    // A --bare request must retain the original user turn rather than invent a\n    // dynamic prompt section merely to satisfy a synthetic assertion.\n    assert.doesNotMatch(JSON.stringify(payload.messages),/dynamic_system_context/)\n    assert.match(JSON.stringify(payload.messages),/Local offline prompt snapshot test/)
    const snapshotBase=join(config,'session-prompt-snapshots')
    const projects=readdirSync(snapshotBase)
    assert.equal(projects.length,1)
    const stored=readdirSync(join(snapshotBase,projects[0]))
    assert.equal(stored.length,1)
    const record=JSON.parse(readFileSync(join(snapshotBase,projects[0],stored[0]),'utf8'))
    assert.equal(record.compactRevision,'initial')
    assert.ok(Array.isArray(record.prompt)&&record.prompt.length>0)
    assert.ok(record.prompt.every(text=>!text.includes('__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__')))
    assert.ok(record.prompt.some(text=>JSON.stringify(payload.system).includes(text.slice(0,100))))
  }finally{
    if(srv.listening)await new Promise(done=>srv.close(done))
    rmSync(temp,{recursive:true,force:true})
  }
})


test('normal CLI sends 2.1.317 system guidance and selected style through the real API wire', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'm2-prompt-317-'))
  const home = join(temp, 'home')
  const config = join(home, '.claude')
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'settings.json'), JSON.stringify({ outputStyle: 'Concise', language: 'English' }))

  let payload
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
      res.writeHead(404)
      res.end()
      return
    }
    let body = ''
    req.on('data', chunk => { body += chunk.toString() })
    req.on('end', () => {
      payload = JSON.parse(body)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(mockResponse())
    })
  })

  try {
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      !/ANTHROPIC|CLAUDE|AWS_|GOOGLE_|OPENAI_|TOKEN|SECRET|API_KEY/i.test(name)))
    Object.assign(env, {
      HOME: home,
      CLAUDE_CONFIG_DIR: config,
      TERM: 'dumb',
      CI: '1',
      NO_COLOR: '1',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + server.address().port,
      ANTHROPIC_API_KEY: 'sk-ant-api03-local-fixture-only',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
    })
    const result = await invoke('bun', [
      resolve('dist/cli.js'),
      '--print',
      '--output-format', 'json',
      '--model', model,
      '--max-turns', '1',
      'Check prompt integration in the current session',
    ], env, temp)
    assert.equal(result.code, 0, 'CLI failed: ' + result.err.slice(-900))
    assert.ok(payload, 'Model API request was not captured')

    const systemText = payload.system.map(block =>
      typeof block === 'string' ? block : block.text ?? '').join('\n')
    assert.match(systemText, /Concise Style Active/)
    assert.match(systemText, /Always respond in English/)
    assert.doesNotMatch(systemText, /Always respond in Simplified Chinese/)
    assert.match(systemText, /For UI or frontend changes, start the dev server/)
    assert.match(systemText, /Finish the full task as requested/)
    assert.match(systemText, /The system may send updates, reminders, or modifications/)
    assert.match(JSON.stringify(payload.messages),
      /Be concise: lead with the result, skip preamble and narration/)
  } finally {
    if (server.listening) await new Promise(resolveClose => server.close(resolveClose))
    rmSync(temp, { recursive: true, force: true })
  }
})
