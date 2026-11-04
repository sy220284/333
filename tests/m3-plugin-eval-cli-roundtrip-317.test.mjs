import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const answer = 'PLUGIN_EVAL_REAL_MODEL_ROUNDTRIP_317'
const model = 'claude-sonnet-4-6'
const frame = (type, data) => 'event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n'
function responseSse() {
  return frame('message_start',{
    type:'message_start',message:{
      id:'msg_eval_317',type:'message',role:'assistant',model,
      content:[],stop_reason:null,stop_sequence:null,
      usage:{ input_tokens:10,output_tokens:0 },
    },
  }) + frame('content_block_start',{
    type:'content_block_start',index:0,content_block:{type:'text',text:''},
  }) + frame('content_block_delta',{
    type:'content_block_delta',index:0,delta:{type:'text_delta',text:answer},
  }) + frame('content_block_stop',{type:'content_block_stop',index:0}) +
  frame('message_delta',{
    type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},
    usage:{output_tokens:7},
  }) + frame('message_stop',{type:'message_stop'})
}
function invoke(args,env,cwd,timeoutMs=120000) {
  return new Promise((resolveRun,reject) => {
    const child = spawn('bun',[resolve('dist/cli.js'), ...args], {
      cwd,env,stdio:['ignore','pipe','pipe'],
    })
    let stdout='',stderr=''
    const timeout=setTimeout(()=>child.kill('SIGKILL'),timeoutMs)
    child.stdout.on('data',b=>{stdout+=b.toString()})
    child.stderr.on('data',b=>{stderr+=b.toString()})
    child.once('error',e=>{clearTimeout(timeout);reject(e)})
    child.once('close',(code,signal)=>{
      clearTimeout(timeout)
      resolveRun({code,signal,stdout,stderr})
    })
  })
}

test('317 plugin eval CLI: real model stream, without/with arms and HTML/JSON outputs', async () => {
  const root=mkdtempSync(join(tmpdir(),'plugin-eval-roundtrip-317-'))
  const plugin=join(root,'plugin'), caseDir=join(plugin,'evals','basic')
  const configDir=join(root,'config'), output=join(root,'results')
  mkdirSync(join(plugin,'.claude-plugin'),{recursive:true})
  mkdirSync(caseDir,{recursive:true})
  mkdirSync(configDir,{recursive:true})
  writeFileSync(join(plugin,'.claude-plugin','plugin.json'),JSON.stringify({name:'eval-fixture'}))
  writeFileSync(join(caseDir,'case.yaml'),`
schema_version: "1.1"
name: basic
runs: 1
execution:
  prompt: Say the verification text
  model: claude-sonnet-4-6
  max_turns: 1
  timeout_seconds: 40
graders:
  - name: exact_output
    type: regex
    pattern: PLUGIN_EVAL_REAL_MODEL_ROUNDTRIP_317
`)
  let requests=0
  const server=createServer((req,res)=>{
    if (req.method==='HEAD') {res.writeHead(200);res.end();return}
    if(req.method!=='POST'||!req.url?.startsWith('/v1/messages')){
      res.writeHead(404);res.end('unknown route');return
    }
    const parts=[]
    req.on('data',x=>parts.push(x))
    req.once('end',()=>{
      try{
        const body=JSON.parse(Buffer.concat(parts).toString('utf8'))
        assert.equal(body.model,model)
        requests++
        res.writeHead(200,{'content-type':'text/event-stream'})
        res.end(responseSse())
      }catch(err){res.writeHead(400);res.end(String(err))}
    })
  })
  try {
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok))
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>
      !/ANTHROPIC|CLAUDE|TOKEN|PASSWORD|SECRET|API_KEY|AWS_|GOOGLE_/i.test(key)))
    Object.assign(env,{
      HOME:root,CLAUDE_CONFIG_DIR:configDir,
      ANTHROPIC_BASE_URL:'http://127.0.0.1:'+server.address().port,
      ANTHROPIC_API_KEY:'sk-ant-api03-plugin-eval-fixture-317',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_TELEMETRY:'1',
      CI:'1',TERM:'dumb',NO_COLOR:'1',
    })
    // Determine whether the rebuilt non-interactive model loop reaches the
    // mock API before attributing a failure to the eval child launcher.
    const direct = await invoke([
      '-p','Say the verification text','--output-format','stream-json',
      '--verbose','--permission-mode','dontAsk','--setting-sources','user',
      '--model',model,'--max-turns','1','--no-session-persistence',
    ],env,root,15000)
    assert.equal(direct.code,0,
      'Direct rebuilt -p child failed before plugin eval: signal='+direct.signal+
      '; requests='+requests+'\\nSTDOUT='+direct.stdout.slice(-1800)+
      '\\nSTDERR='+direct.stderr.slice(-1800))
    assert.equal(requests,1,'Direct rebuilt print mode must invoke the model API')
    requests=0
    const run=await invoke([
      'plugin','eval',plugin,'--trust-plugin','--runs','1',
      '--ablation','with-without','--no-publish',
      '--output-dir',output,'--json',join(root,'eval.json'),
      '--threshold','1',
    ],env,root)
    const reportPath = join(root, 'eval.json')
    // A nonzero exit can be a real grader failure, startup timeout, or
    // child execution error. Preserve the actual eval report in CI output.
    const partialReport = existsSync(reportPath)
      ? readFileSync(reportPath, 'utf8') : '(report not created)'
    assert.equal(run.code,0,
      'CLI status '+run.code+'; signal='+run.signal+'; mock requests='+requests+
      '\nSTDOUT: '+run.stdout.slice(-1800)+
      '\nSTDERR: '+run.stderr.slice(-2400)+
      '\nEVAL REPORT: '+partialReport.slice(-8000))
    const report=JSON.parse(readFileSync(reportPath,'utf8'))
    assert.equal(report.version,'2.1.317')
    assert.equal(report.cases.length,1)
    assert.equal(report.cases[0].runs.length,2)
    assert.equal(report.cases[0].score,1)
    assert.equal(report.score,1)
    assert.equal(requests,2,'both with and without-plugin arms must invoke real model')
    const html=readFileSync(join(output,'report.html'),'utf8')
    assert.match(html,/PLUGIN_EVAL_REAL_MODEL_ROUNDTRIP_317/)
  } finally {
    server.closeAllConnections()
    await new Promise(ok=>server.close(ok))
    rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:200})
  }
})
