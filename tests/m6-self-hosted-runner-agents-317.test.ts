import {test,expect} from 'bun:test'
import {mkdtempSync,readFileSync,statSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {stageRunnerAgentFiles317} from '../src/cli/selfHostedRunner/runnerAgents317.ts'

const temp=()=>mkdtempSync(join(tmpdir(),'byoc-agents-317-'))
const markdown=(name:string,prompt='Inspect source files') =>
  '---\nname: '+name+'\ndescription: Research the requested files\nmodel: haiku\n---\n'+prompt+'\n'

test('317 Runner: merges server agents and validated Markdown agent_files into --agents file',async()=>{
  const root=temp()
  try{
    const existing={description:'Original',prompt:'Original prompt'}
    const result=await stageRunnerAgentFiles317([
      {name:'researcher',content:markdown('researcher','Check code paths')},
    ],JSON.stringify({researcher:existing,writer:{
      description:'Produce a precise report',prompt:'Summarize findings',
    }}),root)
    expect(result.count).toBe(2)
    expect(result.paths).toHaveLength(1)
    expect(result.args).toEqual(['--agents',result.paths[0]])
    const cfg=JSON.parse(readFileSync(result.paths[0],'utf8'))
    expect(cfg.researcher.description).toBe('Research the requested files')
    expect(cfg.researcher.prompt).toBe('Check code paths')
    expect(cfg.researcher.model).toBe('haiku')
    expect(cfg.writer).toEqual({description:'Produce a precise report',prompt:'Summarize findings'})
    if(process.platform!=='win32')expect(statSync(result.paths[0]).mode&0o777).toBe(0o600)
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('317 Runner: missing agents produces no file or child CLI arguments',async()=>{
  const root=temp()
  try{
    expect(await stageRunnerAgentFiles317([],undefined,root))
      .toEqual({args:[],paths:[],count:0})
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('317 Runner: rejects duplicate, malformed and oversized remote agent files',async()=>{
  const root=temp()
  try{
    await expect(stageRunnerAgentFiles317('bad',undefined,root))
      .rejects.toThrow('not an array')
    await expect(stageRunnerAgentFiles317([
      {name:'researcher',content:markdown('researcher')},
      {name:'researcher',content:markdown('researcher')},
    ],undefined,root)).rejects.toThrow('duplicate name')
    await expect(stageRunnerAgentFiles317([
      {name:'../escape',content:markdown('researcher')},
    ],undefined,root)).rejects.toThrow('invalid name')
    await expect(stageRunnerAgentFiles317([
      {name:'researcher',content:markdown('other')},
    ],undefined,root)).rejects.toThrow('matching agent')
    await expect(stageRunnerAgentFiles317([
      {name:'researcher',content:'x'.repeat(1048577)},
    ],undefined,root)).rejects.toThrow('invalid content')
    await expect(stageRunnerAgentFiles317([],JSON.stringify({test:{
      prompt:'Missing description',
    }}),root)).rejects.toThrow('Invalid --agents')
  }finally{rmSync(root,{recursive:true,force:true})}
})
