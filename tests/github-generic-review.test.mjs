import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseReviewRequest } from '../src/commands/reviewMode.ts'
import { validRepository } from '../src/commands/github/repository.ts'
import { githubWorkflow, GITHUB_SCRIPT_PATH, GITHUB_WORKFLOW_PATH } from '../src/commands/github/workflow.ts'
import { githubReviewerScript } from '../src/commands/github/reviewerScript.ts'

test('审查仅接受普通、深度和安全模式', () => {
  assert.throws(() => parseReviewRequest('极深 18'), /已移除/)
  assert.throws(() => parseReviewRequest('--mode=extreme 8'), /已移除/)
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
  assert.doesNotMatch(workflow,/extreme|极深/)
  assert.doesNotMatch(workflow,/anthropics\/claude-code-action|claude\.ai\/settings|CLAUDE_CODE_OAUTH_TOKEN/)
})

test('深度审查包含独立复核，支持三类模型 API', () => {
  const code=githubReviewerScript()
  const syntax=spawnSync('node',['--input-type=module','--check'],{
    input:code,encoding:'utf8'})
  assert.equal(syntax.status,0,syntax.stderr)
  for (const keyword of ['callModel(', '独立复核', '代码正确性及调用链', '安全、性能和测试','max_completion_tokens',
    'api.anthropic.com','api.openai.com','github(','writeFileSync']) {
    assert.ok(code.includes(keyword),keyword)
  }
  assert.doesNotMatch(code,/getClaudeAIOAuthTokens|checkOverageGate|ultrareviewQuota/)
})

test('审查执行链进行 Git 差异采集及不可信输入处理', () => {
  const source=readFileSync(new URL('../src/commands/review.ts',import.meta.url),'utf8')
  for (const keyword of ['execFileNoThrow(', 'diff','git',
    '不可信输入','差异格式校验','高置信']) {
    assert.ok(source.includes(keyword),keyword)
  }
})


test('深度执行器完成两轮审查、独立复核、PR 评论及报告保存', async () => {
  const script=githubReviewerScript().replace(/^import .*$/gm,'')
  const AsyncFunction=Object.getPrototypeOf(async ()=> {}).constructor
  const execute=new AsyncFunction('readFileSync','writeFileSync','execFileSync',
    'process','fetch','setTimeout','clearTimeout','Buffer','URL','AbortController',script)
  const writes=new Map()
  const requests=[]
  let modelCalls=0
  const env={
    GITHUB_REPOSITORY:'owner/example',GITHUB_EVENT_PATH:'mock.json',
    GITHUB_EVENT_NAME:'workflow_dispatch',INPUT_PR_NUMBER:'28',REVIEW_MODE:'deep',
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
        choices:[{message:{content:`第${++modelCalls}轮核查结果`}}]
      })
    }
    throw new Error(`意外网络请求：${url}`)
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
  assert.equal(modelCalls,3)
  assert.ok(writes.get('333-review-report.md').includes('第3轮核查结果'))
  assert.equal(requests.filter(r=>r.url.endsWith('/issues/28/comments')).length,1)
  assert.equal(requests.filter(r=>r.url.startsWith('https://api.openai.com/')).length,3)
})


test('审查后端支持 OpenAI Responses、Anthropic 和 OpenAI 兼容协议', async () => {
  const code=githubReviewerScript().replace(/^import .*$/gm,'')
  const AsyncFunction=Object.getPrototypeOf(async ()=> {}).constructor
  const run=new AsyncFunction('readFileSync','writeFileSync','execFileSync',
    'process','fetch','setTimeout','clearTimeout','Buffer','URL','AbortController',code)
  for(const provider of ['openai-responses','anthropic','openai-compatible']) {
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
          : {choices:[{message:{content:'审查完成'}}]}
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
    if(provider==='openai-compatible') assert.ok(requests[0].body.messages)
  }
})


test('Actions 配置可单独选择代码审查或授权消息自动响应', () => {
  const review=githubWorkflow('review')
  const respond=githubWorkflow('respond')
  const both=githubWorkflow('both')
  assert.match(review,/pull_request_target:/)
  assert.doesNotMatch(review,/^\s+issue_comment:/m)
  assert.match(respond,/issue_comment:/)
  assert.doesNotMatch(respond,/^\s+pull_request_target:/m)
  assert.match(both,/pull_request_target:/)
  assert.match(both,/issue_comment:/)
  for (const yaml of [review,respond,both]) {
    assert.match(yaml,/workflow_dispatch:/)
    assert.match(yaml,/permissions:\n[ ]{2}contents: read\n[ ]{2}pull-requests: write/)
  }
})

test('大型 PR 深度审查按全部差异分块，不丢失文件', async () => {
  const runner = githubReviewerScript().replace(/^import .*$/gm, '')
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const run = new AsyncFunction('readFileSync','writeFileSync','execFileSync',
    'process','fetch','setTimeout','clearTimeout','Buffer','URL','AbortController',runner)
  const diff = `diff --git a/a.ts b/a.ts\n${'+const value = 123;\n'.repeat(11000)}`
  const env = {
    GITHUB_REPOSITORY:'owner/example', GITHUB_EVENT_PATH:'mock.json',
    GITHUB_EVENT_NAME:'workflow_dispatch', INPUT_PR_NUMBER:'19',
    REVIEW_MODE:'deep', MODEL_PROVIDER:'openai-compatible',
    MODEL_NAME:'test-model', MODEL_API_KEY:'test', GH_TOKEN:'test',
  }
  let calls = 0
  let report = ''
  const mockedFetch = async (url) => {
    if (url.endsWith('/pulls/19')) return {
      ok:true, text:async()=>JSON.stringify({title:'完整审查',head:{sha:'abc'},changed_files:1}),
    }
    if (url.endsWith('/issues/19/comments')) return {
      ok:true, text:async()=>JSON.stringify({id:1}),
    }
    calls++
    return {
      ok:true,
      text:async()=>JSON.stringify({choices:[{message:{content:'当前分块已审查'}}]}),
    }
  }
  await run(
    ()=>JSON.stringify({}),(_,value)=>{ report=value },()=>diff,
    {env,stdout:{write(){}}},mockedFetch,()=>0,()=>{},Buffer,
    class { constructor(url) {
      this.protocol=url.startsWith('https://')?'https:':'http:'
      this.username=''; this.password=''; this.hash=''
    } },
    class {signal={};abort(){}},
  )
  assert.ok(calls > 5, 'full PR coverage requires more calls than a single-input review')
  assert.match(report, /差异分块：[2-9]/)
  assert.match(report, /第 1\//)
})

test('自定义模型接口必须使用 HTTPS，不能向 HTTP 地址发送模型密钥', async () => {
  const script = githubReviewerScript().replace(/^import .*$/gm, '')
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const execute = new AsyncFunction('readFileSync','writeFileSync','execFileSync',
    'process','fetch','setTimeout','clearTimeout','Buffer','URL','AbortController',script)
  for (const provider of ['openai-compatible','openai-responses']) {
    const requests = []
    const env = {
      GITHUB_REPOSITORY:'owner/repo', GITHUB_EVENT_PATH:'event.json',
      GITHUB_EVENT_NAME:'workflow_dispatch', INPUT_PR_NUMBER:'17',
      REVIEW_MODE:'normal', MODEL_PROVIDER:provider, MODEL_NAME:'test',
      MODEL_API_KEY:'sensitive-key', GH_TOKEN:'test-token',
      MODEL_BASE_URL:'http://evil.invalid/steal',
    }
    const request = async url => {
      requests.push(url)
      if (url.endsWith('/pulls/17')) return {
        ok:true,text:async()=>JSON.stringify({title:'标题',head:{sha:'abc'}}),
      }
      throw new Error(`意外向外发送：${url}`)
    }
    await assert.rejects(execute(
      ()=>JSON.stringify({}),
      ()=>{},
      ()=> 'diff --git a/a b/a\n+const x = 1\n',
      {env,stdout:{write(){}}},
      request,()=>0,()=>{},
      {byteLength: data => data.length},URL,
      class {signal={};abort(){}},
    ),/HTTPS/,provider)
    assert.equal(requests.length,1,provider)
    assert.ok(requests[0].endsWith('/pulls/17'))
  }
})


test('无共同 Git 历史的 PR 审查依赖 GitHub 差异接口，无需创建原版云端快照', async () => {
  const script = githubReviewerScript().replace(/^import .*$/gm, '')
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const execute = new AsyncFunction('readFileSync','writeFileSync','execFileSync',
    'process','fetch','setTimeout','clearTimeout','Buffer','URL','AbortController',script)
  const commands = []
  const urls = []
  let finished = false
  const env = {
    GITHUB_REPOSITORY:'owner/repo', GITHUB_EVENT_PATH:'event.json',
    GITHUB_EVENT_NAME:'workflow_dispatch', INPUT_PR_NUMBER:'8',
    REVIEW_MODE:'normal', MODEL_PROVIDER:'openai-compatible',
    MODEL_NAME:'test-model', MODEL_API_KEY:'test-secret', GH_TOKEN:'test-token',
  }
  const fetchMock = async url => {
    urls.push(url)
    if (url.endsWith('/pulls/8')) return {
      ok:true, text:async()=>JSON.stringify({title:'独立 Git 历史 PR',head:{sha:'a1'}}),
    }
    if (url.endsWith('/issues/8/comments')) {
      finished = true
      return {ok:true, text:async()=>JSON.stringify({id:1})}
    }
    if (url === 'https://api.openai.com/v1/chat/completions') return {
      ok:true, text:async()=>JSON.stringify({choices:[{message:{content:'已检查完整 PR 差异'}}]}),
    }
    throw new Error(String(url))
  }
  await execute(
    ()=>JSON.stringify({}),
    ()=>{},
    (command,args)=>{
      commands.push({command,args})
      assert.equal(command,'gh')
      assert.deepEqual(args.slice(0,3),['pr','diff','8'])
      return 'diff --git a/orphan.ts b/orphan.ts\n+const orphan = true\n'
    },
    {env,stdout:{write(){}}},
    fetchMock,()=>0,()=>{}, {byteLength: text => text.length},URL,
    class {signal={};abort(){}},
  )
  assert.equal(commands.length,1)
  assert.equal(finished,true)
  assert.equal(urls.filter(url=>url.endsWith('/pulls/8')).length,1)
  assert.equal(urls.filter(url=>url.endsWith('/issues/8/comments')).length,1)
})
