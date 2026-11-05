import {test,expect} from 'bun:test'
import {mapRunnerRemoteCliArgs317,stageRunnerPromptFlags317,stageRunnerMcpConfig317} from '../src/cli/selfHostedRunner/runnerCliArgs317.ts'
import {mkdtempSync,readFileSync,statSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

test('Runner 317: server arguments preserve option format, sequence and leading hyphens',()=>{
  expect(mapRunnerRemoteCliArgs317({
    model:'sonnet', 'max-turns':12, effort:'high',
    'permission-mode':'default',tag:'-literal', empty:'',
  })).toEqual(['--model','sonnet','--max-turns','12','--effort','high',
    '--permission-mode','default','--tag=-literal'])
})
test('Runner 317: deny transport and bootstrap option injection from remote arg dictionary',()=>{
  const skipped:string[]=[]
  const args=mapRunnerRemoteCliArgs317({
    'sdk-url':'https://attacker.invalid',resume:'../../session',
    print:true,'input-format':'plain','debug-file':'/tmp/oops',
    'mcp-config':'./s.json',settings:'{}','system-prompt':'long',
    agents:'{}','session-id':'other','deep-link-origin':'inject',
    model:'opus',bad_key:'illegal',
  },msg=>skipped.push(msg))
  expect(args).toEqual(['--model','opus'])
  expect(skipped.length).toBe(12)
})
test('Runner 317: restricted false and explicitly empty setting sources keep original CLI wire behavior',()=>{
  expect(mapRunnerRemoteCliArgs317({
    restricted:false,'setting-sources':'',unlisted:null,
  })).toEqual(['--restricted','--setting-sources='])
  expect(mapRunnerRemoteCliArgs317({restricted:true})).toEqual([])
  expect(mapRunnerRemoteCliArgs317({restricted:'off'})).toEqual(['--restricted'])
})

test('Runner 317: privileged remote prompts are delivered as private files',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'runner-prompts-317-'))
  try{
    const result=await stageRunnerPromptFlags317({
      'system-prompt':'system rules',
      'append-system-prompt':'append rules',
      'append-subagent-system-prompt':'agent rules',
    },folder,true)
    expect(result.paths).toHaveLength(3)
    expect(result.args.filter(x=>x.endsWith('-file'))).toHaveLength(3)
    expect(result.paths.map(x=>readFileSync(x,'utf8')))
      .toEqual(['system rules','append rules','agent rules'])
    for(const path of result.paths){
      if(process.platform!=='win32')expect(statSync(path).mode&0o777).toBe(0o600)
      expect(existsSync(path)).toBe(true)
    }
  }finally {rmSync(folder,{recursive:true,force:true})}
})
test('Runner 317: an older child receives a short subagent append prompt inline',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'runner-prompts-317-'))
  try{
    const result=await stageRunnerPromptFlags317({
      'append-subagent-system-prompt':'short',
    },folder,false)
    expect(result).toEqual({args:['--append-subagent-system-prompt','short'],paths:[]})
  }finally {rmSync(folder,{recursive:true,force:true})}
})

test('Runner 317: session MCP config is decoded and passed through a private JSON file',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'runner-mcp-317-'))
  try{
    const payload=JSON.stringify({mcpServers:{tool:{command:'node',args:['index.js']}}})
    const result=await stageRunnerMcpConfig317({
      content:Buffer.from(payload).toString('base64'),
    },folder)
    expect(result.args[0]).toBe('--mcp-config')
    expect(result.paths).toHaveLength(1)
    expect(readFileSync(result.paths[0],'utf8')).toBe(payload)
    if(process.platform!=='win32')expect(statSync(result.paths[0]).mode&0o777).toBe(0o600)
  }finally{rmSync(folder,{recursive:true,force:true})}
})
test('Runner 317: missing or malformed remote MCP payload is rejected clearly',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'runner-mcp-317-'))
  try{
    expect(await stageRunnerMcpConfig317(undefined,folder)).toEqual({args:[],paths:[]})
    await expect(stageRunnerMcpConfig317({content:'invalid***'},folder))
      .rejects.toThrow('base64')
    await expect(stageRunnerMcpConfig317({
      content:Buffer.from('{bad json').toString('base64'),
    },folder)).rejects.toThrow('malformed JSON')
  }finally{rmSync(folder,{recursive:true,force:true})}
})
