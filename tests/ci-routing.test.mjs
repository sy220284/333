import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { CHECKS, CHECK_NAMES, FULL_ONLY, routeChanges, globMatch, selectBaseline, buildPlan } from '../build/ci-impact.mjs'

const enabled = (routes) => Object.entries(routes).filter(([,on])=>on).map(([name])=>name)

test('主线全部检查已纳入统一调度，不遗留自动 PR 工作流', () => {
  const files = readdirSync(new URL('../.github/workflows/', import.meta.url))
    .filter(x=>x.endsWith('.yml'))
  const dispatcher=readFileSync(new URL('../.github/workflows/ci-on-demand.yml', import.meta.url),'utf8')
  assert.equal(CHECK_NAMES.length,25)
  assert.equal(new Set(CHECK_NAMES).size,CHECK_NAMES.length)
  for (const n of CHECK_NAMES){
    assert.ok(files.includes(n+'.yml'),n)
    assert.match(dispatcher,new RegExp('uses: ./\\.github/workflows/'+n+'\\.yml'))
  }
  assert.deepEqual(enabled(routeChanges([],true)).sort(),CHECK_NAMES.slice().sort())
})

test('普通文档提交没有专项，基础门禁仍然独立运行',()=>{
  assert.deepEqual(enabled(routeChanges(['README.md','docs/guide.md'])),[])
})

test('多个提交合并路径：源码模型修改只选相关专项',()=>{
  const result=routeChanges([
    'src/tools/BashTool/sedEditParser.ts',
    'src/cli/selfHostedRunner/orchestrator.ts',
    'tests/m1-spinner-pty-harness.test.py',
  ])
  assert.equal(result['m1-sed-preview-parity'],true)
  assert.equal(result['m6-self-hosted-runner-317'],true)
  assert.equal(result['m1-spinner-parity'],true)
  assert.equal(result.rebuild,false)
  assert.equal(result['latest-stable-six-host'],false)
})

test('Draft 改动六平台或全量验收配置不会提前启动全量编译',()=>{
  const plan=routeChanges([
    '.github/workflows/rebuild.yml',
    '.github/workflows/latest-stable-six-host.yml',
    'build/m1-evidence/feature-test.mjs',
  ])
  for(const n of FULL_ONLY) assert.equal(plan[n],false,n)
})

test('文件匹配支持两种星号和嵌套目录',()=>{
  assert.equal(globMatch('src/**','src/foo/inner/file.ts'),true)
  assert.equal(globMatch('src/**','native/foo.ts'),false)
  assert.equal(globMatch('tests/m2-*-317.test.ts','tests/m2-something-317.test.ts'),true)
  assert.equal(globMatch('tests/m2-*-317.test.ts','tests/other/m2-x-317.test.ts'),false)
})

test('未知源码变动也会触发通用质量检查',()=>{
  assert.equal(routeChanges(['src/features/newCapability.ts'])['dev-quality'],true)
})

test('安全变动选 CodeQL，普通业务变动不会每次启动它',()=>{
  assert.equal(routeChanges(['src/utils/permissions/newPolicy.ts']).codeql,true)
  assert.equal(routeChanges(['src/services/agentCenter/state.ts']).codeql,false)
})

test('主线统一调度配置变动触发质量与工具链专项',()=>{
  const plan=routeChanges(['build/ci-impact.mjs'])
  assert.equal(plan['dev-toolchain'],true)
  assert.equal(plan['dev-quality'],true)
})

test('最近成功验收的祖先提交优先用于连续提交累计基准',()=>{
  const old='a'.repeat(40),cancelled='b'.repeat(40),head='c'.repeat(40)
  const records=[
    {head_sha:old,event:'pull_request',pull_requests:[{number:19}],created_at:'2026-11-06T10:00:00Z',status:'completed',conclusion:'success'},
    {head_sha:cancelled,event:'pull_request',pull_requests:[{number:19}],created_at:'2026-11-06T11:00:00Z',status:'completed',conclusion:'cancelled'},
  ]
  assert.deepEqual(selectBaseline(records,19,head,()=>true),
    {sha:old,reason:'last-success'})
})

test('排除其他 PR 和非当前祖先的历史结果',()=>{
  const records=[
    {head_sha:'a'.repeat(40),event:'pull_request',pull_requests:[{number:21}],created_at:'2026-11-06T10:00:00Z',status:'completed',conclusion:'success'},
    {head_sha:'b'.repeat(40),event:'pull_request',pull_requests:[{number:19}],created_at:'2026-11-06T11:00:00Z',status:'completed',conclusion:'success'},
  ]
  assert.equal(selectBaseline(records,19,'c'.repeat(40),()=>false),null)
})

test('Ready for review 立即生成 25 项全量计划，保持可手动全量运行', async()=>{
  const event={pull_request:{draft:false,head:{sha:'a'.repeat(40)},number:19}}
  const plan=await buildPlan(event,null)
  assert.equal(plan.full,true)
  assert.equal(plan.baseline,'review-ready')
  assert.equal(enabled(plan.routes).length,CHECK_NAMES.length)
  const manual=await buildPlan({},null)
  assert.equal(manual.full,true)
})

test('CI 本身与只读依赖锁门禁不回写 PR',()=>{
  const lock=readFileSync(new URL('../.github/workflows/m1-public-lock-sync.yml',import.meta.url),'utf8')
  assert.match(lock,/contents: read/)
  assert.doesNotMatch(lock,/contents: write|git push/)
  assert.match(lock,/git diff --exit-code/)
})
