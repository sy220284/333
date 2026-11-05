import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseReviewRequest } from '../src/commands/reviewMode.ts'
import { validRepository } from '../src/commands/github/repository.ts'
import { githubWorkflow, GITHUB_SCRIPT_PATH, GITHUB_WORKFLOW_PATH } from '../src/commands/github/workflow.ts'
import { githubReviewerScript } from '../src/commands/github/reviewerScript.ts'

test('四种审查模式真实可选，极深为远程审查', () => {
  assert.deepEqual(parseReviewRequest('极深 18'),{mode:'extreme',target:'18'})
  assert.deepEqual(parseReviewRequest('extreme 8'),{mode:'extreme',target:'8'})
  assert.deepEqual(parseReviewRequest('deep main'),{mode:'deep',target:'main'})
  assert.deepEqual(parseReviewRequest('security'),{mode:'security',target:''})
  assert.deepEqual(parseReviewRequest('42'),{mode:'normal',target:'42'})
})

test('GitHub 仓库解析拒绝域名混淆、额外路径', () => {
  assert.equal(validRepository('owner/repo'),'owner/repo')
  assert.equal(validRepository('https://github.com/owner/repo.git'),'owner/repo')
  for (const value of ['https://github.com.evil/owner/repo','owner/repo/extra','foo/..','./repo',
    'https://example.com/owner/repo','owner/repo?token=secret']) {
    assert.throws(()=>validRepository(value),value)
  }
})

test('通用 GitHub 工作流包含显式调用、授权用户触发和最小权限', () => {
  const workflow = githubWorkflow()
  assert.equal(GITHUB_WORKFLOW_PATH,'.github/workflows/333-review.yml')
  assert.equal(GITHUB_SCRIPT_PATH,'.github/scripts/333-review.mjs')
  for (const value of ['workflow_dispatch:','pull_request_target:','issue_comment:',
    'author_association','persist-credentials: false','THREE333_MODEL_API_KEY',
    'THREE333_MODEL_PROVIDER','THREE333_MODEL_NAME','mode:','run: node .github/scripts/333-review.mjs']) {
    assert.ok(workflow.includes(value),value)
  }
  assert.doesNotMatch(workflow,/anthropics\/claude-code-action|claude\.ai\/settings|CLAUDE_CODE_OAUTH_TOKEN/)
})

test('极深审查是真实四轮审查加独立复核，支持三类模型 API', () => {
  const code=githubReviewerScript()
  const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{
    input:code,encoding:'utf8'})
  assert.equal(syntax.status,0,syntax.stderr)
  for (const keyword of ['callModel(', '独立复核', '需求与代码行为', '模块调用与状态生命周期',
    '安全边界与潜在利用', '测试覆盖与回归风险','max_completion_tokens',
    'api.anthropic.com','generativelanguage.googleapis.com','github(','writeFileSync']) {
    assert.ok(code.includes(keyword),keyword)
  }
  assert.doesNotMatch(code,/getClaudeAIOAuthTokens|checkOverageGate|ultrareviewQuota/)
})

test('审查执行链进行 Git 差异采集及不可信输入处理', () => {
  const source=readFileSync(new URL('../src/commands/review.ts',import.meta.url),'utf8')
  for (const keyword of ['dispatchExtremeReview(', 'execFileNoThrow(', 'diff','git',
    '不可信输入','差异格式校验','高置信']) {
    assert.ok(source.includes(keyword),keyword)
  }
})


test('极深执行器真实完成四轮审查、独立复核、PR 评论及报告保存', async () => {
  const script=githubReviewerScript().replace(/^import .*$/gm,'')
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
  const execute=new AsyncFunction('readFileSync','writeFileSync','execFileSync',
    'process','fetch','setTimeout','clearTimeout','Buffer','URL','AbortController',script)
  const writes=new Map()
  const requests=[]
  let modelCalls=0
  const env={
    GITHUB_REPOSITORY:'owner/example',GITHUB_EVENT_PATH:'mock.json',
    GITHUB_EVENT_NAME:'workflow_dispatch',INPUT_PR_NUMBER:'28',REVIEW_MODE:'extreme',
    MODEL_PROVIDER:'openai-compatible',MODEL_NAME:'test-model',
    MODEL_API_KEY:'fake-for-test',GH_TOKEN:'fake-for-test',
  }
  const fetch=async (url,options) => {
    requests.push({url,method:options.method})
    if(url.endsWith('/pulls/28')) return {
      ok:true,text:async()=>JSON.stringify({title:'变更测试',head:{sha:'abc'}})
    }
    if(url.endsWith('/issues/28/comments')) return {
      ok:true,text:async()=>JSON.stringify({id:1})
    }
    if(url==='https://api.openai.com/v1/chat/completions') return {
      ok:true,text:async()=>JSON.stringify({
        choices:[{message:{content:'第'+(++modelCalls)+'轮核查结果'}}]
      })
    }
    throw new Error('意外网络请求：'+url)
  }
  const FakeURL=class {
    constructor(url) {
      this.protocol=url.startsWith('https://') ? 'https:' : 'http:'
      this.username='';this.password='';this.hash=''
    }
  }
  const FakeAbortController=class { signal={}; abort(){} }
  await execute(
    ()=>JSON.stringify({}),
    (name,body)=>writes.set(name,body),
    (_command,args)=>{
      assert.deepEqual(args.slice(0,3),['pr','diff','28'])
      return 'diff --git a/a.ts b/a.ts\n+console.log(2)\n'
    },
    {env,stdout:{write() {}}},
    fetch,()=>0,()=>{}, {byteLength:s=>s.length},FakeURL,FakeAbortController,
  )
  assert.equal(modelCalls,5)
  assert.ok(writes.get('333-review-report.md').includes('第5轮核查结果'))
  assert.equal(requests.filter(r=>r.url.endsWith('/issues/28/comments')).length,1)
  assert.equal(requests.filter(r=>r.url.startsWith('https://api.openai.com/')).length,5)
})


test('极深后端支持 OpenAI Responses、Anthropic、Gemini 三类原生协议', async () => {
  const code=githubReviewerScript().replace(/^import .*$/gm,'')
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
  const run=new AsyncFunction('readFileSync','writeFileSync','execFileSync',
    'process','fetch','setTimeout','clearTimeout','Buffer','URL','AbortController',code)
  for(const provider of ['openai-responses','anthropic','gemini']) {
    const requests=[], saved=new Map()
    const env={
      GITHUB_REPOSITORY:'company/example',GITHUB_EVENT_PATH:'event.json',
      GITHUB_EVENT_NAME:'workflow_dispatch',INPUT_PR_NUMBER:'5',REVIEW_MODE:'normal',
      MODEL_PROVIDER:provider,MODEL_NAME:'model',MODEL_API_KEY:'test',GH_TOKEN:'test',
    }
    const fetch=async(url,opts)=>{
      if(url.endsWith('/pulls/5')) return {
        ok:true,text:async()=>JSON.stringify({title:'测试',head:{sha:'0123'}})
      }
      if(url.endsWith('/issues/5/comments')) return {
        ok:true,text:async()=>JSON.stringify({id:2})
      }
      requests.push({url,headers:opts.headers,body:JSON.parse(opts.body)})
      const answer=provider==='openai-responses'
        ? {output:[{content:[{type:'output_text',text:'审查完成'}]}]}
        : provider==='anthropic'
          ? {content:[{type:'text',text:'审查完成'}]}
          : {candidates:[{content:{parts:[{text:'审查完成'}]}}]}
      return {ok:true,text:async()=>JSON.stringify(answer)}
    }
    await run(
      ()=>JSON.stringify({}),
      (name,text)=>saved.set(name,text),
      ()=>'+变更',
      {env,stdout:{write(){}}},
      fetch,()=>0,()=>{},
      {byteLength:s=>s.length},
      class {constructor(url){this.protocol=url.startsWith('https://')?'https:':'http:';this.username='';this.password='';this.hash=''}},
      class {signal={};abort(){}},
    )
    assert.equal(requests.length,1,provider)
    assert.ok(saved.get('333-review-report.md').includes('审查完成'),provider)
    if(provider==='openai-responses') assert.ok(requests[0].body.input)
    if(provider==='anthropic') assert.ok(requests[0].headers['anthropic-version'])
    if(provider==='gemini') assert.ok(requests[0].body.contents)
  }
})
