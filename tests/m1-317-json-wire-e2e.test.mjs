import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const model = 'claude-sonnet-4-6'
const sample = 'WIRE_HEAD|\u007f|\u0085|\u200b|\u2060|\u2028|\u2029|\ufeff|\u{e0001}|WIRE_END'
const rawControls = [0x7f,0x85,0x200b,0x2060,0x2028,0x2029,0xfeff,0xe0001]
const wireEscapes = ['\\u007f','\\u0085','\\u200b','\\u2060','\\u2028','\\u2029','\\ufeff','\\udb40\\udc01']
function event(type,data) { return 'event: '+type+'\ndata: '+JSON.stringify(data)+'\n\n' }
function response() {
  const start = {type:'message_start',message:{
    id:'msg_jsonwire317',type:'message',role:'assistant',model,
    content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:3,output_tokens:0},
  }}
  return [
    event('message_start',start),
    event('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}),
    event('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:sample}}),
    event('content_block_stop',{type:'content_block_stop',index:0}),
    event('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}}),
    event('message_stop',{type:'message_stop'}),
  ].join('')
}
async function execute(binary,prefix,baseUrl,format) {
  const home=mkdtempSync(join(tmpdir(),'333-jsonwire317-'))
  const env={...process.env,
    HOME:home,USERPROFILE:home,CLAUDE_CONFIG_DIR:join(home,'.claude'),
    XDG_CONFIG_HOME:join(home,'.config'),ANTHROPIC_BASE_URL:baseUrl,
    ANTHROPIC_API_KEY:'sk-test',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CI:'1',NO_COLOR:'1',
  }
  for(const k of Object.keys(env))if(k.startsWith('ANTHROPIC_')&&!['ANTHROPIC_BASE_URL','ANTHROPIC_API_KEY'].includes(k)) delete env[k]
  try {
    return await new Promise((accept,reject)=>{
      let stdout='',stderr='',timedOut=false
      const child=spawn(binary,[...prefix,'-p','hello','--model',model,
        '--output-format',format,'--verbose','--max-turns','1','--tools',''],{
        env,cwd:home,stdio:['ignore','pipe','pipe'],
      })
      const timeout=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},30000)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data',data=>stdout+=data)
      child.stderr.on('data',data=>stderr+=data)
      child.on('error',err=>{clearTimeout(timeout);reject(err)})
      child.on('close',code=>{
        clearTimeout(timeout)
        if(timedOut)reject(new Error('Timed out '+binary+' '+format+': '+stderr.slice(-250)))
        else accept({code,stdout,stderr})
      })
    })
  } finally {rmSync(home,{recursive:true,force:true})}
}
test('317 x64 and rebuilt JSON/stream-json escape invisible Unicode controls byte-for-byte', {timeout:180000}, async()=>{
  const server=createServer(async(req,res)=>{
    for await(const _part of req) { /* consume SSE request */ }
    const data=response()
    res.writeHead(200,{'Content-Type':'text/event-stream','Content-Length':Buffer.byteLength(data)})
    res.end(data)
  })
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept)})
  try {
    const url='http://127.0.0.1:'+server.address().port
    const candidates=[['rebuilt','bun',[resolve('dist/cli.js')]]]
    if(process.env.CLAUDE_TARGET_X64)candidates.push(['official-2.1.317',process.env.CLAUDE_TARGET_X64,[]])
    for(const [name,binary,prefix] of candidates) {
      for(const format of ['json','stream-json']) {
        const out=await execute(binary,prefix,url,format)
        assert.equal(out.code,0,name+' '+format+': '+out.stderr)
        assert.ok(out.stdout.includes('WIRE_HEAD'),name+' '+format+' sample missing')
        for(const [i,escape] of wireEscapes.entries()){
          assert.ok(out.stdout.includes(escape),name+' '+format+': '+escape+' missing')
          assert.ok(!out.stdout.includes(String.fromCodePoint(rawControls[i])),name+' '+format+': raw format control survived')
        }
        const messages=out.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line))
        const content=JSON.stringify(messages)
        assert.ok(messages.some(m=>JSON.stringify(m).includes('WIRE_HEAD')),name+' '+format+': parsed content lost')
        assert.ok(content.includes('WIRE_HEAD'),name+' '+format+': content missing')
      }
    }
  } finally {await new Promise(done=>server.close(done))}
})
