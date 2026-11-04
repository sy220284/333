import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const model = 'claude-sonnet-4-6'
const remote = 'shared-session-xyz'
const expected = '5895c78b-8662-577a-9653-a9820deac56d'

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
function respond() {
  return [
    sse('message_start', {type:'message_start',message:{
      id:'msg_test317',type:'message',role:'assistant',model,
      content:[],stop_reason:null,stop_sequence:null,
      usage:{input_tokens:3,output_tokens:0},
    }}),
    sse('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}),
    sse('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'ACK'}}),
    sse('content_block_stop',{type:'content_block_stop',index:0}),
    sse('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}}),
    sse('message_stop',{type:'message_stop'}),
  ].join('')
}
async function launch(binary, prefix, baseUrl, envExtra) {
  const home = mkdtempSync(join(tmpdir(),'cc317-nested-id-'))
  const env = {...process.env,
    HOME:home,USERPROFILE:home,CLAUDE_CONFIG_DIR:join(home,'.claude'),
    XDG_CONFIG_HOME:join(home,'.config'),ANTHROPIC_BASE_URL:baseUrl,
    ANTHROPIC_API_KEY:'sk-test',DISABLE_AUTOUPDATER:'1',
    DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CI:'1',NO_COLOR:'1',
    ...envExtra,
  }
  for(const k of Object.keys(env)) {
    if(k.startsWith('ANTHROPIC_') && !['ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL'].includes(k)) delete env[k]
    if(k.startsWith('CLAUDE_CODE_CHILD_SESSION')||k==='CLAUDE_CODE_DISABLE_NESTED_SESSION_ID'||k==='CLAUDE_CODE_REMOTE_SESSION_ID')
      if(!Object.hasOwn(envExtra,k)) delete env[k]
  }
  try {
    return await new Promise((done,reject)=>{
      let out='',err='',expired=false
      const child=spawn(binary,[...prefix,'-p','hi','--model',model,'--output-format','stream-json','--verbose',
        '--max-turns','1','--tools',''],{env,cwd:home,stdio:['ignore','pipe','pipe']})
      const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL')},25000)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data',chunk=>out+=chunk)
      child.stderr.on('data',chunk=>err+=chunk)
      child.on('error',error=>{clearTimeout(timer);reject(error)})
      child.on('close',code=>{
        clearTimeout(timer)
        if(expired) return reject(new Error('Timed out: '+binary+' '+err.slice(-400)))
        const events=out.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line))
        const ids=new Set(events.map(e=>e.session_id).filter(Boolean))
        done({code,events,ids:[...ids],stderr:err})
      })
    })
  } finally {rmSync(home,{recursive:true,force:true})}
}

test('317 native and rebuilt processes share remote UUIDv5 while isolating child -p transcripts', {timeout:180000}, async ()=>{
  const server=createServer(async(req,res)=>{
    for await (const _part of req) { /* drain posted message */ }
    const body=respond()
    res.writeHead(200,{'Content-Type':'text/event-stream','Content-Length':Buffer.byteLength(body)})
    res.end(body)
  })
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)})
  try {
    const url=`http://127.0.0.1:${server.address().port}`
    const targets=[['rebuilt','bun',[resolve('dist/cli.js')]]]
    if(process.env.CLAUDE_TARGET_X64)targets.push(['official-2.1.317',process.env.CLAUDE_TARGET_X64,[]])
    for(const [name,binary,prefix] of targets) {
      const runs={}
      for(const [variant,extra] of [
        ['root',{}],
        ['remote',{CLAUDE_CODE_REMOTE_SESSION_ID:remote}],
        ['nested',{CLAUDE_CODE_REMOTE_SESSION_ID:remote,CLAUDE_CODE_CHILD_SESSION:'1'}],
        ['nested-disabled',{CLAUDE_CODE_REMOTE_SESSION_ID:remote,CLAUDE_CODE_CHILD_SESSION:'1',
          CLAUDE_CODE_DISABLE_NESTED_SESSION_ID:'1'}],
      ]) {
        const out=await launch(binary,prefix,url,extra)
        assert.equal(out.code,0,`${name} ${variant}: ${out.stderr}`)
        assert.ok(out.events.some(e=>e.type==='result' && e.result==='ACK'),`${name} ${variant}: no result`)
        assert.equal(out.ids.length,1,`${name} ${variant}: mixed IDs ${JSON.stringify(out.ids)}`)
        runs[variant]=out.ids[0]
      }
      assert.match(runs.root,/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
      assert.equal(runs.remote,expected,`${name}: remote v5 identity`)
      assert.notEqual(runs.nested,expected,`${name}: parent transcript contamination`)
      assert.equal(runs['nested-disabled'],expected,`${name}: compatibility flag`)
      const next=await launch(binary,prefix,url,{CLAUDE_CODE_REMOTE_SESSION_ID:remote,CLAUDE_CODE_CHILD_SESSION:'1'})
      assert.equal(next.code,0,`${name}: second nested launch ${next.stderr}`)
      assert.notEqual(next.ids[0],runs.nested,`${name}: unrelated nested invocations shared a transcript`)
      assert.notEqual(runs.root,runs.remote)
    }
  } finally {await new Promise(done=>server.close(done))}
})
