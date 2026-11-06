import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { githubWorkflow, GITHUB_TASK_SCRIPT_PATH } from '../src/commands/github/workflow.ts'
import { githubReviewerScript } from '../src/commands/github/reviewerScript.ts'
import { githubTaskRunnerScript } from '../src/commands/github/taskRunnerScript.ts'
import { validRepository } from '../src/commands/github/repository.ts'

function loadInstaller(mockGh) {
  let source=readFileSync(new URL('../src/commands/github/github.ts',import.meta.url),'utf8')
  source=source.replace(/^import .*$/gm,'').replace(/^export /gm,'')
  source=`const GITHUB_WORKFLOW_PATH='.github/workflows/yaoyaoche-review.yml';const GITHUB_SCRIPT_PATH='.github/scripts/yaoyaoche-review.mjs';const GITHUB_TASK_SCRIPT_PATH='.github/scripts/yaoyaoche-task.mjs';\n${source}`
  source=stripTypeScriptTypes(source,{mode:'strip'})
  const ctor=Object.getPrototypeOf(async()=>{}).constructor
  return new ctor('execFileNoThrow','githubWorkflow','githubReviewerScript',
    'githubTaskRunnerScript','validRepository','randomUUID','Buffer',
    `${source}\nreturn {setupRepository,dispatchReview}`)(mockGh,githubWorkflow,
    githubReviewerScript,githubTaskRunnerScript,validRepository,()=> 'aabbccdd-0000',Buffer)
}
function installationFixture({push=true,privateRepo=true,failPrOnce=false}={}) {
 const calls=[],state={tree:[],branches:{},created:0,prFailures:0}, files=new Map()
 async function exec(cmd,args,opts={}) {
  assert.equal(cmd,'gh')
  calls.push(args)
  const path=args.find(v=>v.startsWith('repos/org/code'))
  if(args[0]==='auth')return {code:0,stdout:'ok',stderr:''}
  if(args[0]==='api'&&path==='repos/org/code')
    return success({permissions:{push},private:privateRepo,default_branch:'main'})
  if(args[0]==='pr'&&args[1]==='list')return success([])
  if(args[0]==='api'&&path?.includes('matching-refs'))return success(
    Object.keys(state.branches).map(v=>({ref:`refs/heads/${v}`})))
  if(args[0]==='api'&&path?.includes('/contents/')) {
   const key=path.split('/contents/')[1].split('?ref=')
   const saved=files.get(`${decodeURIComponent(key[1])}|${key[0]}`)
   return saved===undefined?{code:1,stderr:'HTTP 404 Not Found',stdout:''}:
    success({type:'file',encoding:'base64',content:Buffer.from(saved).toString('base64')})
  }
  if(args[0]==='api'&&path?.includes('/git/ref/heads/'))
    return success({object:{sha:'parent123'}})
  if(args[0]==='api'&&path?.includes('/git/commits/parent123'))
    return success({tree:{sha:'baseTree'}})
  if(args[0]==='api'&&path==='repos/org/code/git/trees'){
    const tree=JSON.parse(opts.input).tree;state.tree=tree
    return success({sha:'newTree'})
  }
  if(args[0]==='api'&&path==='repos/org/code/git/commits')return success({sha:'commitSha'})
  if(args[0]==='api'&&path==='repos/org/code/git/refs'){
    const ref=args.find(v=>v.startsWith('ref=refs/heads/')).split('=')[1].slice('refs/heads/'.length)
    state.branches[ref]=true;for(const x of state.tree)files.set(`${ref}|${x.path}`,x.content)
    return success({})
  }
  if(args[0]==='pr'&&args[1]==='create'){
    if(failPrOnce&&state.prFailures++===0)return {code:1,stderr:'temporary GitHub API error',stdout:''}
    state.created++;return success('https://github.com/org/code/pull/77')
  }
  throw new Error(`Unexpected gh: ${args.join(' ')}`)
 }
 return {exec,state,calls}
}
function success(value){return{code:0,stdout:typeof value==='string'?value:JSON.stringify(value),stderr:''}}

test('私有仓库安装：原子提交审查与开发三文件，PR 标题和描述均使用中文',async()=>{
 const fixture=installationFixture(),{setupRepository}=await loadInstaller(fixture.exec)
 const result=await setupRepository('org/code','both')
 assert.match(result,/pull\/77/)
 assert.equal(fixture.state.created,1)
 assert.deepEqual(fixture.state.tree.map(v=>v.path).sort(),[
   '.github/scripts/yaoyaoche-review.mjs',GITHUB_TASK_SCRIPT_PATH,
   '.github/workflows/yaoyaoche-review.yml'].sort())
 const pr=fixture.calls.find(v=>v[0]==='pr'&&v[1]==='create')
 assert.match(pr[pr.indexOf('--title')+1],/[\u4e00-\u9fa5]/)
 assert.match(pr[pr.indexOf('--body')+1],/[\u4e00-\u9fa5]/)
 assert.match(fixture.state.tree[0].content,/permissions:/)
})
test('GitHub 权限不足时配置在写入前中止',async()=>{
 const f=installationFixture({push:false}),{setupRepository}=await loadInstaller(f.exec)
 await assert.rejects(setupRepository('org/code','both'),/写入权限/)
 assert.equal(f.state.tree.length,0)
 assert.equal(f.state.created,0)
})
test('安装中断后从原分支恢复 PR，不重复提交 Git 对象',async()=>{
 const f=installationFixture({failPrOnce:true}),{setupRepository}=await loadInstaller(f.exec)
 await assert.rejects(setupRepository('org/code','both'),/PR 创建失败/)
 const ref=Object.keys(f.state.branches)
 assert.equal(ref.length,1)
 const result=await setupRepository('org/code','both')
 assert.match(result,/pull\/77/)
 assert.equal(Object.keys(f.state.branches).length,1)
 assert.equal(f.state.created,1)
 assert.equal(f.calls.filter(x=>x.includes('repos/org/code/git/trees')).length,1)
})
test('审查只读、开发写入的 Actions 权限隔离与官方品牌解除绑定',()=>{
 const yml=githubWorkflow('both')
 for(const text of ['pull_request_target:','issue_comment:','pull_request_review_comment:',
  'pull_request_review:','issues:','contents: read','contents: write',
  'yaoyaoche-task.mjs','persist-credentials: false'])assert.ok(yml.includes(text),text)
 assert.doesNotMatch(yml,/anthropics\/claude-code-action|CLAUDE_CODE_OAUTH_TOKEN/)
 const onlyReview=githubWorkflow('review')
 assert.match(onlyReview,/issue_comment:/)
 assert.match(onlyReview,/startsWith\(github\.event\.comment\.body, '\/yaoyaoche review'\)/)
 assert.doesNotMatch(onlyReview,/pull_request_review_comment:/)
 assert.doesNotMatch(onlyReview,/  task:\n/)
 const onlyRespond=githubWorkflow('respond')
 assert.doesNotMatch(onlyRespond,/pull_request_target:/)
 assert.doesNotMatch(onlyRespond,/startsWith\(github\.event\.comment\.body, '\/yaoyaoche review'\)/)
 assert.match(onlyRespond,/  task:\n/)
})
function reviewerHarness(overrides={}) {
 const code=githubReviewerScript().replace(/^import .*$/gm,'')
 const Fn=Object.getPrototypeOf(async()=>{}).constructor
 const run=new Fn('readFileSync','writeFileSync','execFileSync','process','fetch',
  'setTimeout','clearTimeout','Buffer','URL','AbortController',code)
 const calls=[],written=new Map()
 const env={GITHUB_REPOSITORY:'org/code',GITHUB_EVENT_PATH:'event.json',
  GITHUB_EVENT_NAME:'workflow_dispatch',INPUT_PR_NUMBER:'31',REVIEW_MODE:'normal',
  MODEL_PROVIDER:'openai-compatible',MODEL_NAME:'test',MODEL_API_KEY:'fake',
  GH_TOKEN:'token',...overrides}
 const diff=['diff --git a/src/a.ts b/src/a.ts','--- a/src/a.ts','+++ b/src/a.ts',
  '@@ -3,2 +3,3 @@',' const a = 1','+const changed = true',' const b = 1',''].join('\n')
 const fakeFetch=async(url,options)=>{
  calls.push({url,options})
  let data
  if(url.endsWith('/pulls/31'))data={title:'external fork',head:{sha:'abc',repo:{full_name:'fork/code'}},changed_files:1}
  else if(url.endsWith('/pulls/31/reviews'))data={id:1}
  else if(url.endsWith('/issues/31/comments'))data={id:2}
  else data={choices:[{message:{content:'确认变更。<inline-findings>'+
    JSON.stringify([{path:'src/a.ts',line:4,body:'第4行新增行为可能导致不兼容'},
      {path:'src/a.ts',line:900,body:'伪造行号必须过滤'}])+'</inline-findings>'}}]}
  return{ok:true,text:async()=>JSON.stringify(data)}
 }
 return {calls,written,run:()=>run(()=>JSON.stringify({}),
  (name,body)=>written.set(name,body),
  (cmd,args)=>{assert.equal(cmd,'gh');assert.deepEqual(args.slice(0,3),['pr','diff','31']);return diff},
  {env,stdout:{write(){}}},fakeFetch,()=>0,()=>{},Buffer,URL,
  class{signal={};abort(){}}
 )}
}
test('外部 PR 只审查 diff，原生逐行评论仅引用实际新增行',async()=>{
 const fixture=reviewerHarness()
 await fixture.run()
 const native=fixture.calls.find(v=>v.url.endsWith('/pulls/31/reviews'))
 assert.ok(native,'应提交 GitHub 原生逐行审查')
 const payload=JSON.parse(native.options.body)
 assert.equal(payload.commit_id,'abc')
 assert.deepEqual(payload.comments,[{path:'src/a.ts',line:4,side:'RIGHT',body:'第4行新增行为可能导致不兼容'}])
 assert.ok(fixture.calls.some(v=>v.url.endsWith('/issues/31/comments')))
 assert.match(fixture.written.get('yaoyaoche-review-report.md'),/逐行评论：1 条/)
})
test('task 脚本保持独立、支持改文件及 GitHub 原生创建 PR',()=>{
 const script=githubTaskRunnerScript()
 for(const line of ['changes=new Map()', "cmd.action==='edit'",
  "cmd.action==='test'", "'/git/trees'", "'/pulls','POST'",
  "yaoyaoche/task-", "author_association"])assert.ok(script.includes(line),line)
 const syntax=githubTaskRunnerScript().replace(/^import .*$/gm,'')
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor
 assert.doesNotThrow(()=>new AsyncFunction('readFileSync','writeFileSync','readdirSync',
  'mkdirSync','lstatSync','resolve','relative','dirname','execFileSync',
  'process','fetch','URL','AbortController','setTimeout','clearTimeout','Buffer',syntax))
})
