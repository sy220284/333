import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, lstatSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative, dirname } from 'node:path'
import { githubTaskRunnerScript } from '../src/commands/github/taskRunnerScript.ts'

const Fn=Object.getPrototypeOf(async()=>{}).constructor
const compiled=new Fn('readFileSync','writeFileSync','readdirSync','mkdirSync','lstatSync',
 'resolve','relative','dirname','execFileSync','process','fetch','URL','AbortController',
 'setTimeout','clearTimeout','Buffer',githubTaskRunnerScript().replace(/^import .*$/gm,''))

function scenario({association='OWNER',failPrOnce=false,body='/yaoyaoche task 修改并测试代码'}={}) {
 const dir=mkdtempSync(join(tmpdir(),'github-task-test-'))
 mkdirSync(join(dir,'src'))
 const file=join(dir,'src','a.ts'),writes=new Map([[file,'const status_old = true;\n']])
 const api='https://api.github.com/repos/org/code'
 const event={issue:{number:77},comment:{id:991,body,
  author_association:association}}
 const env={GITHUB_REPOSITORY:'org/code',GITHUB_EVENT_PATH:'event.json',
  GITHUB_EVENT_NAME:'issue_comment',MODEL_NAME:'test-model',
  MODEL_PROVIDER:'openai-compatible',MODEL_API_KEY:'fixture-key',GH_TOKEN:'fixture-token'}
 const history=[],state={modelCalls:0,branchCreated:0,commits:0,prs:0,failedPr:0,tests:0}
 const actions=[
   {action:'read',path:'src/a.ts'},
   {action:'edit',path:'src/a.ts',old:'status_old',new:'status_new'},
   {action:'test',command:'node --test'},
   {action:'done',summary:'已修改代码并通过测试'},
 ]
 function ok(body) {return {ok:true,status:200,text:async()=>JSON.stringify(body)}}
 async function fetchMock(url,options={}) {
  history.push({url,method:options.method,body:options.body})
  if(url==='https://api.openai.com/v1/chat/completions')
    return ok({choices:[{message:{content:JSON.stringify(actions[state.modelCalls++%actions.length])}}]})
  if(url===api)return ok({default_branch:'main',private:true})
  if(url===`${api}/git/ref/heads/main`)return ok({object:{sha:'baseSha'}})
  if(url===`${api}/git/commits/baseSha`)return ok({tree:{sha:'baseTree'}})
  if(url===`${api}/git/trees`&&options.method==='POST')return ok({sha:'newTree'})
  if(url===`${api}/git/commits`&&options.method==='POST'){state.commits++;return ok({sha:'newCommit'})}
  if(url===`${api}/git/refs`&&options.method==='POST'){state.branchCreated++;return ok({ref:'refs/heads/yaoyaoche/task-991'})}
  if(url===`${api}/git/ref/heads/yaoyaoche%2Ftask-991`)
    return state.branchCreated?ok({object:{sha:'newCommit'}}):{status:404,ok:false,text:async()=>''}
  if(url.startsWith(`${api}/pulls?`))return ok([])
  if(url===`${api}/pulls`&&options.method==='POST'){
   if(failPrOnce&&state.failedPr++===0)return{ok:false,status:503,text:async()=>'temporary'}
   state.prs++;return ok({html_url:'https://github.com/org/code/pull/99'})
  }
  if(url===`${api}/issues/77/comments`&&options.method==='POST')return ok({id:77})
  throw new Error(`Unexpected remote request ${url}`)
 }
 const read=path=> {
  if(path==='event.json')return JSON.stringify(event)
  const saved=writes.get(path)
  if(saved===undefined)throw Error(`Unexpected read ${path}`)
  return saved
 }
 const write=(path,body)=>writes.set(path,body)
 const exec=(cmd,args,opts)=>{assert.equal(cmd,'node');assert.deepEqual(args,['--test'])
  assert.equal(opts.env.GH_TOKEN,undefined);assert.equal(opts.env.MODEL_API_KEY,undefined)
  state.tests++;return 'tests passed'}
 async function run() {return compiled(read,write,readdirSync,mkdirSync,lstatSync,resolve,relative,
  dirname,exec,{env,cwd:()=>dir},fetchMock,URL,AbortController,
  setTimeout,clearTimeout,Buffer)}
 return {run,state,history,writes,file,cleanup:()=>rmSync(dir,{recursive:true,force:true})}
}

test('授权评论真实执行链：读取、编辑、测试、创建分支和中文 PR，凭据不进入测试环境',async()=>{
 const f=scenario()
 try {
  await f.run()
  assert.equal(f.state.modelCalls,4)
  assert.equal(f.state.tests,1)
  assert.equal(f.state.branchCreated,1)
  assert.equal(f.state.commits,1)
  assert.equal(f.state.prs,1)
  assert.match(f.writes.get(f.file),/const status_new = true/)
  assert.match(f.writes.get('yaoyaoche-task-report.md'),/代码 PR/)
  const pr=f.history.find(x=>x.url.endsWith('/pulls')&&x.method==='POST')
  const body=JSON.parse(pr.body)
  assert.match(body.title,/[\u4e00-\u9fa5]/)
  assert.match(body.body,/[\u4e00-\u9fa5]/)
  assert.ok(f.history.some(x=>x.url.endsWith('/issues/77/comments')))
 }finally{f.cleanup()}
})
test('非授权评论无法启动代码任务或调用模型',async()=>{
 const f=scenario({association:'NONE'})
 try{
  await assert.rejects(f.run(),/授权成员/)
  assert.equal(f.state.modelCalls,0)
  assert.equal(f.state.commits,0)
 }finally{f.cleanup()}
})
test('GitHub PR 创建失败后保留已提交分支，并在重试时恢复 PR',async()=>{
 const f=scenario({failPrOnce:true})
 try{
  await assert.rejects(f.run(),/GitHub API 503/)
  assert.equal(f.state.branchCreated,1)
  assert.equal(f.state.commits,1)
  // A retried Actions job checks out the unchanged default branch afresh.
  f.writes.set(f.file,'const status_old = true;\n')
  f.state.modelCalls=0
  await f.run()
  assert.equal(f.state.branchCreated,1)
  assert.equal(f.state.commits,1)
  assert.equal(f.state.prs,1)
  const lastPr=f.history.filter(x=>x.url.endsWith('/pulls')&&x.method==='POST').at(-1)
  assert.match(JSON.parse(lastPr.body).title,/恢复/)
 }finally{f.cleanup()}
})

test('旧版提及触发等价：正文中部 @yaoyaoche 也能执行通用开发任务',async()=>{
 const f=scenario({body:'请 @yaoyaoche 修改并测试代码'})
 try{
  await f.run()
  assert.equal(f.state.modelCalls,4)
  assert.equal(f.state.tests,1)
  assert.equal(f.state.prs,1)
  assert.ok(f.history.some(x=>x.url.endsWith('/issues/77/comments')))
 }finally{f.cleanup()}
})
