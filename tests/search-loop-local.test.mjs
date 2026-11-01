import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const model = 'claude-sonnet-4-6';
const reply = 'MOCK_AGENT_SEARCH_OK_333';
const fixtureContent = 'FIXTURE_333_READ_RESULT';
const SSE = (event, data) => 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';

function responseBlocks(content, stopReason, index) {
  const id = 'msg_333_mock_' + index;
  return [
    SSE('message_start', {type:'message_start',message:{
      id,type:'message',role:'assistant',model,content:[],
      stop_reason:null,stop_sequence:null,
      usage:{input_tokens:8,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0}
    }}),
    ...content,
    SSE('message_delta',{type:'message_delta',delta:{stop_reason:stopReason,stop_sequence:null},usage:{output_tokens:7}}),
    SSE('message_stop',{type:'message_stop'})
  ].join('');
}

async function launch(executable, file, args, cwd, env) {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(executable, [file, ...args], {cwd,env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 18000);
    child.stdout.on('data',x => stdout+=x.toString());
    child.stderr.on('data',x => stderr+=x.toString());
    child.on('error',error => {clearTimeout(timeout);reject(error)});
    child.on('close',(code,signal) => {
      clearTimeout(timeout);
      if (code!==0) reject(Error('Process failed: '+JSON.stringify({executable,file,code,signal,stdout:stdout.slice(-1200),stderr:stderr.slice(-1200)})));
      else resolveRun(JSON.parse(stdout.trim()));
    });
  });
}

test('original and rebuilt versions both execute Glob and Grep through model-tool-model streaming', async () => {
  mkdirSync(join(root,'.rebuild'),{recursive:true});
  const tmp=mkdtempSync(join(root,'.rebuild','333-model-loop-'));
  const filename=join(tmp,'example.txt');
  writeFileSync(filename,fixtureContent+'\n');
  const sessions=new Map();
  let active='none';
  const server=createServer((req,res) => {
    if(req.method==='HEAD') {res.writeHead(200);res.end();return}
    if(req.method!=='POST'||!req.url.startsWith('/v1/messages')) {
      res.writeHead(404);res.end('Unsupported test request');return
    }
    const chunks=[];
    req.on('data',chunk => chunks.push(chunk));
    req.on('end',() => {
      try {
        const msg=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        assert.equal(msg.model,model);
        assert.ok(Array.isArray(msg.messages));
        const state=sessions.get(active);
        state.count++;
        let content,stop;
        if(state.count===1) {
          content=[
            SSE('content_block_start',{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'toolu_333_search',name:state.tool,input:{}}}),
            SSE('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(state.tool === 'Glob' ? {pattern:'*.txt'} : {pattern:'FIXTURE_333_READ_RESULT',output_mode:'content'})}}),
            SSE('content_block_stop',{type:'content_block_stop',index:0})
          ];
          stop='tool_use';
        } else if(state.count===2) {
          const last=JSON.stringify(msg.messages.at(-1));
          assert.match(last, state.tool === 'Glob' ? /example\.txt/ : /FIXTURE_333_READ_RESULT/);
          state.sawToolResult=true;
          content=[
            SSE('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}),
            SSE('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:reply}}),
            SSE('content_block_stop',{type:'content_block_stop',index:0})
          ];
          stop='end_turn';
        } else {throw Error('Unexpected additional model request')}
        res.writeHead(200,{'content-type':'text/event-stream'});
        res.end(responseBlocks(content,stop,state.count));
      } catch(error) {res.writeHead(400);res.end(String(error))}
    });
  });
  try {
    await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
    const baseUrl='http://127.0.0.1:'+server.address().port;
    const env={...process.env,ANTHROPIC_BASE_URL:baseUrl,ANTHROPIC_API_KEY:'sk-333-local-fixture',
      DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CI:'true',NO_COLOR:'1'};
    const baseArgs=['--bare','-p','Search the example.txt file','--model',model,'--output-format','json','--max-turns','2'];
    for(const tool of ['Glob','Grep']) for(const [name,executable,file] of [
      ['original',process.execPath,join(root,'cli.js')],
      ['rebuilt','bun',join(root,'dist/cli.js')]
    ]) {
      active=tool+'-'+name;
      sessions.set(active,{count:0,sawToolResult:false,tool});
      const result=await launch(executable,file,[...baseArgs,'--tools',tool],tmp,env);
      assert.equal(result.result,reply,active+' answer mismatch');
      assert.equal(result.is_error,false,active+' returned an error');
      assert.equal(result.num_turns,2,active+' executed wrong number of model turns');
      assert.deepEqual(sessions.get(active),{count:2,sawToolResult:true,tool},active+' search result not submitted');
    }
  } finally {
    server.closeAllConnections();
    await new Promise(done=>server.close(done));
    rmSync(tmp,{recursive:true,force:true});
  }
});


test('original and rebuilt CLIs execute Read → Edit → Write → Read with matching file outcomes', async () => {
  mkdirSync(join(root,'.rebuild'),{recursive:true});
  const tmp=mkdtempSync(join(root,'.rebuild','333-edit-loop-'));
  const first=join(tmp,'example.txt'), second=join(tmp,'created.txt');
  const before='BEFORE_333_EDIT_VALUE', after='AFTER_333_EDIT_VALUE', created='CREATED_BY_333_WRITE';
  const finalAnswer='MOCK_AGENT_EDIT_WRITE_OK';
  const sessions=new Map();
  let active='none';
  const actions=[
    {name:'Read',input:{file_path:'example.txt'},toolId:'toolu_333_read_before'},
    {name:'Edit',input:{file_path:'example.txt',old_string:before,new_string:after},toolId:'toolu_333_edit'},
    {name:'Write',input:{file_path:'created.txt',content:created},toolId:'toolu_333_write'},
    {name:'Read',input:{file_path:'created.txt'},toolId:'toolu_333_read_after'},
  ];
  const server=createServer((req,res)=>{
    if(req.method==='HEAD') {res.writeHead(200);res.end();return}
    if(req.method!=='POST'||!req.url.startsWith('/v1/messages')) {res.writeHead(404);res.end();return}
    const parts=[];
    req.on('data',c=>parts.push(c));
    req.on('end',()=>{
      try {
        const message=JSON.parse(Buffer.concat(parts).toString('utf8'));
        assert.equal(message.model,model);
        const state=sessions.get(active);
        state.count++;
        const i=state.count-1;
        const last=JSON.stringify(message.messages.at(-1));
        if(i===1) assert.match(last,/BEFORE_333_EDIT_VALUE/);
        if(i===2) assert.match(last,/toolu_333_edit/);
        if(i===3) assert.match(last,/toolu_333_write/);
        if(i===4) assert.match(last,/CREATED_BY_333_WRITE/);
        let blocks,stop;
        if(i<actions.length) {
          const a=actions[i];
          blocks=[
            SSE('content_block_start',{type:'content_block_start',index:0,content_block:{type:'tool_use',id:a.toolId,name:a.name,input:{}}}),
            SSE('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(a.input)}}),
            SSE('content_block_stop',{type:'content_block_stop',index:0})
          ];
          stop='tool_use';
        } else if(i===actions.length) {
          state.sawAllToolResults=true;
          blocks=[
            SSE('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}),
            SSE('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:finalAnswer}}),
            SSE('content_block_stop',{type:'content_block_stop',index:0}),
          ];
          stop='end_turn';
        } else throw Error('Unexpected extra model request '+state.count);
        res.writeHead(200,{'content-type':'text/event-stream'});
        res.end(responseBlocks(blocks,stop,state.count));
      } catch(error){res.writeHead(400);res.end(String(error))}
    });
  });
  try {
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    const baseUrl='http://127.0.0.1:'+server.address().port;
    const env={...process.env,ANTHROPIC_BASE_URL:baseUrl,ANTHROPIC_API_KEY:'sk-333-local-fixture',
      DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CI:'true',NO_COLOR:'1'};
    const args=['--bare','-p','Read and edit example.txt, create created.txt, then read it',
      '--tools','Read,Edit,Write','--permission-mode','acceptEdits','--model',model,'--output-format','json','--max-turns','5'];
    for(const [name,exe,file] of [
      ['original',process.execPath,join(root,'cli.js')],
      ['rebuilt','bun',join(root,'dist/cli.js')]
    ]){
      writeFileSync(first,before+'\n');
      rmSync(second,{force:true});
      active=name;sessions.set(name,{count:0,sawAllToolResults:false});
      const result=await launch(exe,file,args,tmp,env);
      assert.equal(result.is_error,false,name+' execution error');
      assert.equal(result.result,finalAnswer,name+' output mismatch');
      assert.equal(readFileSync(first,'utf8'),after+'\n',name+' file edit mismatch');
      assert.equal(readFileSync(second,'utf8'),created,name+' file write mismatch');
      assert.deepEqual(sessions.get(name),{count:5,sawAllToolResults:true},name+' tool chain mismatch');
    }
  } finally {
    server.closeAllConnections();
    await new Promise(done=>server.close(done));
    rmSync(tmp,{recursive:true,force:true});
  }
});
