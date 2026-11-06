#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import { CHECKS } from './ci-impact.mjs'
const workflow = name => readFileSync(new URL('../.github/workflows/' + name, import.meta.url),'utf8')
const files = readdirSync(new URL('../.github/workflows/', import.meta.url)).filter(x=>x.endsWith('.yml'))
const errors=[]
const dispatch = workflow('ci-on-demand.yml')
const names=Object.keys(CHECKS)

for (const name of names) {
  if (!files.includes(name+'.yml')) {errors.push('专项工作流缺失：'+name);continue}
  const source=workflow(name+'.yml')
  if (!/^ {2}workflow_call:\s*$/m.test(source))
    errors.push('专项未提供 workflow_call 入口：'+name)
  if (/^ {2}pull_request:\s*$/m.test(source))
    errors.push('专项绕过总入口重复响应 PR：'+name)
  if (!dispatch.includes('uses: ./.github/workflows/'+name+'.yml'))
    errors.push('统一调度遗漏专项：'+name)
  if (!dispatch.includes('needs.plan.outputs.'+name.replaceAll('-','_')))
    errors.push('调度缺少此专项路由条件：'+name)
  if (!new RegExp('^  group: main-ci-'+name+'-', 'm').test(source))
    errors.push('专项独立并发组缺失：'+name)
  if (!/^  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m.test(source))
    errors.push('专项缺少 PR 过期运行取消设置：'+name)
  if (/^  push:\s*$/m.test(source)) {
    const lines=source.split(/\r?\n/)
    const i=lines.findIndex(x=>/^ {2}push:\s*$/.test(x))
    let j=i+1
    while(j<lines.length&&(/^ {4}/.test(lines[j])||!lines[j].trim()))j++
    if(!/^ {4}branches:/m.test(lines.slice(i+1,j).join('\n')))
      errors.push('专项 push 触发没有指定分支：'+name)
  }
}
for (const file of files) {
  if (file==='ci-on-demand.yml') continue
  if (/^ {2}pull_request:\s*$/m.test(workflow(file)))
    errors.push('主线上另有自动 PR 工作流绕过总入口：'+file)
}
if (!/ready_for_review/.test(dispatch)||!/converted_to_draft/.test(dispatch)||
    !/synchronize/.test(dispatch))
  errors.push('PR Draft / Ready 状态变更事件未覆盖')
if (!/node build\/ci-impact\.mjs/.test(dispatch)||
    !/node build\/ci-gate-audit\.mjs/.test(dispatch)||
    !/node --test tests\/ci-routing\.test\.mjs/.test(dispatch))
  errors.push('基础审计与按需计算没有真实执行')
if (!/needs:\s*\[plan, basic,/.test(dispatch)||
    !/if: \$\{\{ !cancelled\(\) \}\}/.test(dispatch))
  errors.push('统一汇总门禁缺少基础、专项失败收敛或取消逻辑')
const lock=workflow('m1-public-lock-sync.yml')
if (/contents:\s*write/.test(lock)||/git\s+push/.test(lock)||
    !/git diff --exit-code -- build\/public-dependencies\.lock\.json/.test(lock))
  errors.push('PR 依赖锁一致性门禁必须只读且真实检查差异')
const upgrade=workflow('latest-stable-upgrade.yml')
if (/^ {2}pull_request:/m.test(upgrade)) errors.push('依赖自动升级仍在 PR 执行')

if (errors.length){
  for(const e of errors) console.error('[ci-gate] '+e)
  process.exitCode=1
}else{
  console.log('[ci-gate] 统一入口、'+names.length+' 个专项、'+files.length+' 条工作流及只读锁验收通过')
}
