import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { mkdtempSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { spareClaimTokenMatches317, consumeBgSpareAuth317 } from '../src/bootstrap/bgSpare317.mjs'

const root=resolve(import.meta.dirname,'..')
const cli=join(root,'dist/cli.js')
const native=join(root,'dist',process.platform==='win32'?'claude.exe':'claude')
const modes=process.env.M1_NATIVE_BINARY_RUN==='1'?[['rebuilt',native,[]]]:[['rebuilt','bun',[cli]]]
const official=process.env.CLAUDE_REFERENCE_BIN||process.env.CLAUDE_TARGET_X64
if(official)modes.unshift(['official',official,[]])
const env={...process.env,DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CI:'true',NO_COLOR:'1'}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function ready(path, child) {
  for(let i=0;i<240;i++) {
    if(existsSync(path))return
    if(child.exitCode!==null)throw Error('spare exited before claim, status '+child.exitCode)
    await sleep(50)
  }
  throw Error('spare socket not ready')
}
function launch(binary,prefix,sock,moreEnv={}) {
  const child=spawn(binary,[...prefix,'--bg-spare',sock],{
    cwd:root,stdio:['ignore','pipe','pipe'],env:{...env,...moreEnv},windowsHide:true,
  })
  let stdout='',stderr=''
  child.stdout.on('data',chunk=>{stdout+=chunk.toString()})
  child.stderr.on('data',chunk=>{stderr+=chunk.toString()})
  const done=new Promise((resolve,reject)=>{
    child.once('error',reject)
    child.once('close',(code,signal)=>resolve({code,signal,stdout,stderr}))
  })
  return {child,done}
}
async function send(sock,value,raw=false) {
  await new Promise((resolve,reject)=>{
    const stream=connect(sock)
    stream.on('error',()=>{})
    stream.once('connect',()=>{stream.end((raw?value:JSON.stringify(value))+'\n');resolve()})
    stream.once('close',()=>{})
  })
}
async function awaitExit(started,label) {
  return Promise.race([started.done,new Promise((_,reject)=>
    setTimeout(()=>reject(Error(label+' did not exit')),24_000))])
}
test('317 background spare protects socket claim with constant-time tokens',async()=>{
  assert.equal(spareClaimTokenMatches317('correct','correct'),true)
  for(const wrong of ['',undefined,42,'incorrect','correct-x'])
    assert.equal(spareClaimTokenMatches317(wrong,'correct'),false)
  const home=mkdtempSync(join(tmpdir(),'333-bgspare-token-'))
  try {
    const file=join(home,'tokens.json')
    writeFileSync(file,JSON.stringify({claimAuth:'read-from-file',ptyAuth:'separate'}))
    const environment={CLAUDE_BG_CLAIM_AUTH:'fallback',CLAUDE_BG_SOCKET_TOKENS_PATH:file}
    assert.equal(await consumeBgSpareAuth317(environment),'read-from-file')
    assert.equal(existsSync(file),false)
    assert.equal('CLAUDE_BG_CLAIM_AUTH' in environment,false)
    assert.equal('CLAUDE_BG_SOCKET_TOKENS_PATH' in environment,false)
  }finally{rmSync(home,{recursive:true,force:true})}
})
test('317 official and rebuilt spare require a claim socket path',()=>{
  for(const [label,binary,prefix] of modes){
    const result=spawnSync(binary,[...prefix,'--bg-spare'],{
      env,encoding:'utf8',timeout:8000,windowsHide:true,
    })
    assert.ifError(result.error)
    assert.equal(result.status,2,label+JSON.stringify(result))
    assert.match(result.stderr,/missing claim sock path/)
  }
})
test('317 official and rebuilt warm spare reject wrong auth and accept one valid claim', {
  skip:process.platform==='win32',timeout:80_000,
},async()=>{
  for(const [label,binary,prefix] of modes){
    const home=mkdtempSync(join(tmpdir(),'333-bgspare-claim-'))
    const sock=join(home,'claim.sock')
    const started=launch(binary,prefix,sock,{HOME:home,CLAUDE_CONFIG_DIR:home,CLAUDE_BG_CLAIM_AUTH:'claim-secret'})
    try {
      await ready(sock,started.child)
      const claim={cwd:home,argv:['--version'],env:{HOME:home,CLAUDE_CONFIG_DIR:home,
        DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'},
        sessionId:'caller-claim',auth:'claim-secret'}
      await send(sock,{...claim,auth:'wrong-secret'})
      await sleep(130)
      assert.equal(started.child.exitCode,null,label+' wrong claim ended worker')
      assert.equal(existsSync(sock),true,label+' claim socket lost after bad auth')
      await send(sock,'{bad JSON',true)
      await sleep(90)
      assert.equal(started.child.exitCode,null,label+' malformed claim ended worker')
      await send(sock,claim)
      const result=await awaitExit(started,label)
      assert.equal(result.code,0,label+JSON.stringify(result))
      assert.equal(result.stdout.trim(),'2.1.317 (Claude Code)',label)
      assert.equal(existsSync(sock),false,label+' socket left behind')
    }finally{started.child.kill('SIGKILL');rmSync(home,{recursive:true,force:true})}
  }
})
test('317 official and rebuilt warm spare consume token file then execute claimed version', {
  skip:process.platform==='win32',timeout:80_000,
},async()=>{
  for(const [label,binary,prefix] of modes){
    const home=mkdtempSync(join(tmpdir(),'333-bgspare-token-file-'))
    const file=join(home,'tokens.json'),sock=join(home,'claim.sock')
    writeFileSync(file,JSON.stringify({claimAuth:'secret-from-file',ptyAuth:'pty-token'}))
    const started=launch(binary,prefix,sock,{HOME:home,CLAUDE_CONFIG_DIR:home,CLAUDE_BG_SOCKET_TOKENS_PATH:file})
    try{
      await ready(sock,started.child)
      assert.equal(existsSync(file),false,label+' token file not removed')
      await send(sock,{auth:'secret-from-file',cwd:home,argv:['--version'],
        env:{HOME:home,CLAUDE_CONFIG_DIR:home}})
      const result=await awaitExit(started,label)
      assert.equal(result.code,0,label+JSON.stringify(result))
      assert.equal(result.stdout.trim(),'2.1.317 (Claude Code)',label)
      assert.equal(existsSync(sock),false,label+' socket residue')
    }finally{started.child.kill('SIGKILL');rmSync(home,{recursive:true,force:true})}
  }
})
test('317 official and rebuilt bg-spare use claimed session identity and fresh API credentials', {
  skip:process.platform==='win32',timeout:80_000,
},async()=>{
  const seen=[]
  const frame=(name,data)=>'event: '+name+'\ndata: '+JSON.stringify(data)+'\n\n'
  const server=createServer((req,res)=>{
    if(req.method!=='POST'||!req.url.startsWith('/v1/messages')){res.writeHead(404).end();return}
    const parts=[]
    req.on('data',chunk=>parts.push(chunk))
    req.on('end',()=>{
      const body=JSON.parse(Buffer.concat(parts).toString())
      seen.push({key:req.headers['x-api-key'],model:body.model})
      res.writeHead(200,{'content-type':'text/event-stream'})
      res.end([
        frame('message_start',{type:'message_start',message:{id:'msg_spare',type:'message',
          role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,
          usage:{input_tokens:2,output_tokens:0}}}),
        frame('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}),
        frame('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'BG_SPARE_OK'}}),
        frame('content_block_stop',{type:'content_block_stop',index:0}),
        frame('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:2}}),
        frame('message_stop',{type:'message_stop'}),
      ].join(''))
    })
  })
  await new Promise(done=>server.listen(0,'127.0.0.1',done))
  try{
    for(const [label,binary,prefix] of modes){
      const home=mkdtempSync(join(tmpdir(),'333-bgspare-model-'))
      const sock=join(home,'claim.sock')
      const started=launch(binary,prefix,sock,{HOME:home,CLAUDE_CONFIG_DIR:home,
        ANTHROPIC_BASE_URL:'http://127.0.0.1:1',ANTHROPIC_API_KEY:'old-key',
        CLAUDE_BG_CLAIM_AUTH:'token-claim'})
      try{
        await ready(sock,started.child)
        await send(sock,{auth:'token-claim',cwd:home,sessionId:'bg-spare-claimed-session',
          argv:['--bare','-p','hi','--model','claude-sonnet-4-6','--output-format=json'],
          env:{HOME:home,CLAUDE_CONFIG_DIR:home,
            ANTHROPIC_BASE_URL:'http://127.0.0.1:'+server.address().port,
            ANTHROPIC_API_KEY:'fresh-key',DISABLE_TELEMETRY:'1',
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'}})
        const result=await awaitExit(started,label)
        assert.equal(result.code,0,label+JSON.stringify(result))
        const output=JSON.parse(result.stdout.trim())
        assert.equal(output.result,'BG_SPARE_OK',label)
        assert.equal(output.session_id,'bg-spare-claimed-session',label)
        assert.equal(seen.at(-1).key,'fresh-key',label+' retained stale credentials')
        assert.equal(seen.at(-1).model,'claude-sonnet-4-6')
        assert.equal(existsSync(sock),false,label+' socket residue')
      }finally{started.child.kill('SIGKILL');rmSync(home,{recursive:true,force:true})}
    }
    assert.equal(seen.length,modes.length)
  }finally{server.closeAllConnections();await new Promise(done=>server.close(done))}
})
