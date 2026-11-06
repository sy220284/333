#!/usr/bin/env node
/**
 * PR gate invariants, checked before any expensive build.
 * A retired test or an inert last-commit filter must not claim CI success.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
const base = new URL('../', import.meta.url)
const root = file => new URL(file, base)
const directory = root('.github/workflows/')
const yaml = name => readFileSync(root(`.github/workflows/${name}`), 'utf8')
const errors = []
const required = [
  'ci-test-matrix.yml',
  'rebuild.yml',
  'independent-models.yml',
  'independent-product-cleanup.yml',
  'dev-quality.yml',
  'codeql.yml',
  'governance-security-probe.yml',
]
for (const name of required) {
  if (!existsSync(root(`.github/workflows/${name}`))) {
    errors.push(`缺失核心工作流：${name}`)
    continue
  }
  if (!/^ {2}workflow_call:/m.test(yaml(name))) errors.push(`未纳入统一调用入口：${name}`)
}
const workflows = readdirSync(directory).filter(name => name.endsWith('.yml'))
for (const name of workflows) {
  const content = yaml(name)
  if (/upgrade\/2\.1\.310-m1-evidence/.test(content) && name !== 'rebuild.yml') {
    errors.push(`旧升级分支依赖：${name}`)
  }
}
// Keep only the latest PR checks running. Dependency-lock verification is
// read-only and follows the same cancellation contract as other PR gates.
for (const name of workflows) {
  const source = yaml(name)
  if (!/^ {2}workflow_call:/m.test(source)) continue
  if (!/^ {2}cancel-in-progress: (true|\$\{\{ github\.event_name == 'pull_request' \}\})$/m.test(source)) {
    errors.push(`PR 检查没有取消过期运行：${name}`)
  }
  if (/^ {2}group:.*(?:github\.sha|pull_request\.head\.sha)/m.test(source)) {
    errors.push(`并发分组仍绑定提交 SHA：${name}`)
  }
}

// Only the dispatcher starts checks on PR events. Reusable workflows retain
// their original main-branch push and explicit manual entrypoints.
const dispatcher = yaml('ci-on-demand.yml')
if (!/^ {2}pull_request:/m.test(dispatcher) ||
    !/ready_for_review/.test(dispatcher) ||
    !/converted_to_draft/.test(dispatcher) ||
    !/synchronize/.test(dispatcher))
  errors.push('缺少 Draft / 待审转换和继续提交的完整调度')
if (!/ci-on-demand-/.test(dispatcher) ||
    !/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/.test(dispatcher))
  errors.push('统一调度缺少同一 PR 的过期运行合并')
if (!/node build\/ci-impact\.mjs/.test(dispatcher) ||
    !/needs: \[plan, basic,/.test(dispatcher))
  errors.push('统一调度缺少累计改动识别或稳定汇总门禁')
for (const name of workflows) {
  if (name === 'ci-on-demand.yml' || name === 'latest-stable-upgrade.yml') continue
  const source = yaml(name)
  if (/^ {2}pull_request:/m.test(source))
    errors.push(`专项工作流仍绕过统一调度直接响应 PR：${name}`)
  if (!/^ {2}workflow_call:/m.test(source))
    errors.push(`专项工作流缺少可复用入口：${name}`)
  if (!dispatcher.includes(`./.github/workflows/${name}`))
    errors.push(`专项工作流未接入全量调度：${name}`)
  if (/^ {2}group: \$\{\{ github\.workflow \}\}/m.test(source))
    errors.push(`可复用检查并发组未隔离：${name}`)
}

// A generic push trigger would bypass the router on the PR branch.
for (const name of workflows) {
  const lines = yaml(name).split(/\r?\n/)
  const index = lines.findIndex(line => /^ {2}push:\s*$/.test(line))
  if (index < 0) continue
  let end = index + 1
  while (end < lines.length && (/^ {4}/.test(lines[end]) || !lines[end].trim())) end++
  const pushBlock = lines.slice(index + 1, end).join('\n')
  if (!/^ {4}branches:/m.test(pushBlock))
    errors.push('工作流的任意分支 push 入口绕过 PR 调度：' + name)
}

for (const name of ['sdk-stream-parity.yml','m1-spinner-parity.yml']) {
  if (yaml(name).includes('git diff-tree --root')) errors.push(`仅最后提交判断造成空跑：${name}`)
  if (yaml(name).includes('/2.1.310/')) errors.push(`旧版对照基准：${name}`)
}
for (const name of ['m4-send-to-project-317.yml']) {
  if (workflows.includes(name)) errors.push(`已删除功能工作流残留：${name}`)
}
if (yaml('rebuild.yml').includes('m6-ultrareview-runtime-config-317.test.mjs')) {
  errors.push('已删除云审查门禁仍在全量构建中')
}

for (const name of workflows) {
  const source = yaml(name)
  if (/ref:\s*\$\{\{\s*github\.event\.pull_request\.number\s*\|\|/.test(source))
    errors.push(`checkout 误用 PR 编号作为分支名：${name}`)
}
const securityProbe = yaml('governance-security-probe.yml')
if (/npm run (?:verify|test:all)/.test(securityProbe))
  errors.push('高风险依赖门禁重复执行缺少独立环境的全量测试')
if (!securityProbe.includes('tests/m1-prometheus-security-317.test.mjs') ||
    !securityProbe.includes('tests/m1-telemetry-policy.test.mjs'))
  errors.push('高风险依赖门禁缺失安全接口与隐私策略专项测试')
const lockGate = yaml('m1-public-lock-sync.yml')
if (/contents:\s*write/.test(lockGate) || /git\s+push\s+origin/.test(lockGate))
  errors.push('依赖锁门禁不得在审查时自动改写 PR：m1-public-lock-sync.yml')
if (!/node tools\/dev\/toolchain\.mjs check/.test(lockGate))
  errors.push('依赖锁缺失实际基准校验：m1-public-lock-sync.yml')
const matrix = yaml('ci-test-matrix.yml')
if (!/needs:\s*\[inventory, build, core, supplemental, oracle\]/.test(matrix) ||
    !/if:\s*\$\{\{ !cancelled\(\) \}\}/.test(matrix) ||
    !/\[\[ "\$\{result\}" != success \]\]/.test(matrix)) {
  errors.push('全量测试缺少失败汇总门禁：ci-test-matrix.yml')
}
if (/^ {4}paths(?:-ignore)?:/m.test(matrix.split(/^ {2}workflow_call:/m)[1]?.split(/^ {2}(?:push|workflow_dispatch):/m)[0] ?? ''))
  errors.push('全量测试门禁不得过滤 PR 路径：ci-test-matrix.yml')
if (existsSync(root('tests/m6-ultrareview-cli-native-parity-317.test.mjs')))
  errors.push('已退役 Ultrareview CLI 原生对照测试仍存在')

if (errors.length) {
  for (const error of errors) console.error(`[ci-gate] ${error}`)
  process.exitCode = 1
} else {
  console.log(`[ci-gate] 现行门禁、旧分支清理及真实对照检查通过，共 ${workflows.length} 条工作流`)
}
