import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const model = 'claude-sonnet-4-6';
const reply = 'MOCK_AGENT_READ_OK_333';
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
    const timeout = setTimeout(() => child.kill('SIGKILL'), 60000);
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

test('original and independent rebuild both perform model-tool-model file read loop', async () => {
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
            SSE('content_block_start',{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'toolu_333_file_read',name:'Read',input:{}}}),
            SSE('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify({file_path:'example.txt'})}}),
            SSE('content_block_stop',{type:'content_block_stop',index:0})
          ];
          stop='tool_use';
        } else if(state.count===2) {
          const last=JSON.stringify(msg.messages.at(-1));
          assert.match(last,/FIXTURE_333_READ_RESULT/);
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
    const args=['--bare','-p','Read the file example.txt','--tools','Read','--model',model,'--output-format','json','--max-turns','2'];
    for(const [name,executable,file] of [
      ['original',process.execPath,join(root,'cli.js')],
      ['rebuilt','bun',join(root,'dist/cli.js')]
    ]) {
      active=name;
      sessions.set(name,{count:0,sawToolResult:false});
      const result=await launch(executable,file,args,tmp,env);
      assert.equal(result.result,reply,name+' answer mismatch');
      assert.equal(result.is_error,false,name+' returned an error');
      assert.equal(result.num_turns,2,name+' executed wrong number of model turns');
      assert.deepEqual(sessions.get(name),{count:2,sawToolResult:true},name+' Read tool result was not submitted to the model');
    }
  } finally {
    server.closeAllConnections();
    await new Promise(done=>server.close(done));
    rmSync(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:500});
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
    {name:'Edit',input:{file_path:first,old_string:before,new_string:after},toolId:'toolu_333_edit'},
    {name:'Write',input:{file_path:second,content:created},toolId:'toolu_333_write'},
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
        const lastMessage=message.messages.at(-1);
        const last=JSON.stringify(lastMessage);
        if(i>0){
          const result=lastMessage?.content?.find?.(block=>block.type==='tool_result');
          assert.ok(result,'Missing tool result: '+last);
          assert.notEqual(result.is_error,true,'Tool '+actions[i-1].name+' failed: '+JSON.stringify(result));
        }
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
    const args=['-p','Read and edit example.txt, create created.txt, then read it',
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
    rmSync(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:500});
  }
});
