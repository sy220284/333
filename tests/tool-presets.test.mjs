import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const model = 'claude-sonnet-4-6';
const reply = 'M3_TOOLS_PRESET_OK';
const SSE = (event, data) => 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';

function answer() {
  return [
    SSE('message_start', {type:'message_start',message:{
      id:'msg_m3',type:'message',role:'assistant',model,content:[],
      stop_reason:null,stop_sequence:null,
      usage:{input_tokens:8,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0}
    }}),
    SSE('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}),
    SSE('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:reply}}),
    SSE('content_block_stop',{type:'content_block_stop',index:0}),
    SSE('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:5}}),
    SSE('message_stop',{type:'message_stop'})
  ].join('');
}

async function launch(exe, path, cwd, env, toolArg) {
  const args = ['--bare','-p','Respond briefly','--tools',toolArg,'--model',model,'--output-format','json','--max-turns','1'];
  return await new Promise((ok, fail) => {
    const child = spawn(exe,[path,...args],{cwd,env,stdio:['ignore','pipe','pipe']});
    let stdout = '', stderr = '';
    const guard = setTimeout(()=>child.kill('SIGKILL'),60000);
    child.stdout.on('data',d=>stdout+=d.toString());
    child.stderr.on('data',d=>stderr+=d.toString());
    child.once('error',err=>{clearTimeout(guard);fail(err)});
    child.once('close',(code,signal)=>{
      clearTimeout(guard);
      if (code !== 0) return fail(Error('Tool-preset CLI failed '+JSON.stringify({code,signal,stderr:stderr.slice(-1000)})));
      try { ok(JSON.parse(stdout.trim())); } catch(err) { fail(err); }
    });
  });
}

test('M3 --tools default, explicit Read, and empty set match the old binary on real API requests', async () => {
  mkdirSync(join(root,'.rebuild'),{recursive:true});
  const cwd=mkdtempSync(join(root,'.rebuild','333-tool-presets-'));
  const captured = [];
  const server=createServer((req,res)=>{
    if(req.method==='HEAD'){res.writeHead(200);res.end();return}
    if(req.method!=='POST'||!req.url.startsWith('/v1/messages')){
      res.writeHead(404);res.end('Unexpected API request');return;
    }
    const chunks=[];
    req.on('data',d=>chunks.push(d));
    req.on('end',()=>{
      try {
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        assert.equal(body.model,model);
        captured.push((body.tools??[]).map(tool=>tool.name).sort());
        res.writeHead(200,{'content-type':'text/event-stream'});
        res.end(answer());
      } catch(error){ res.writeHead(400);res.end(String(error)); }
    });
  });
  try {
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
    const env={...process.env,
      ANTHROPIC_BASE_URL:'http://127.0.0.1:'+server.address().port,
      ANTHROPIC_API_KEY:'sk-333-m3-fixture',
      DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CI:'true',NO_COLOR:'1'};
    const baselines = new Map();
    for(const toolArg of ['default','Read','']) {
      for(const [variant,exe,path] of [
        ['original',process.execPath,join(root,'cli.js')],
        ['rebuilt','bun',join(root,'dist/cli.js')]
      ]) {
        const before=captured.length;
        const result=await launch(exe,path,cwd,env,toolArg);
        assert.equal(result.result,reply);
        assert.equal(result.is_error,false);
        assert.equal(captured.length,before+1,'Expected exactly one model request');
        const names=captured.at(-1);
        if(variant==='original') baselines.set(toolArg,names);
        else assert.deepEqual(names,baselines.get(toolArg),'Tool preset differs for '+JSON.stringify(toolArg));
      }
    }
    const defaultTools=baselines.get('default');
    const readOnly=baselines.get('Read');
    const none=baselines.get('');
    assert.ok(defaultTools.includes('Read'),'Default does not expose Read');
    assert.deepEqual(readOnly,['Read'],'Explicit Read must exclude other tools');
    assert.deepEqual(none,[],'Empty preset must disable all tools');
  } finally {
    server.closeAllConnections();
    await new Promise(ok=>server.close(ok));
    rmSync(cwd,{recursive:true,force:true,maxRetries:12,retryDelay:500});
  }
});
