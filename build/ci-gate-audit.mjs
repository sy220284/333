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
]
for (const name of required) {
  if (!existsSync(root(`.github/workflows/${name}`))) {
    errors.push(`缺失核心工作流：${name}`)
    continue
  }
  if (!/^ {2}pull_request:/m.test(yaml(name))) errors.push(`PR 未触发：${name}`)
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
  if (!/^ {2}pull_request:/m.test(source)) continue
  if (!/^ {2}cancel-in-progress: (true|\$\{\{ github\.event_name == 'pull_request' \}\})$/m.test(source)) {
    errors.push(`PR 检查没有取消过期运行：${name}`)
  }
  if (/^ {2}group:.*(?:github\.sha|pull_request\.head\.sha)/m.test(source)) {
    errors.push(`并发分组仍绑定提交 SHA：${name}`)
  }
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
const lockGate = yaml('m1-public-lock-sync.yml')
if (/contents:\s*write/.test(lockGate) || /git\s+push\s+origin/.test(lockGate))
  errors.push('依赖锁门禁不得在审查时自动改写 PR：m1-public-lock-sync.yml')
if (!/node tools\/dev\/toolchain\.mjs check/.test(lockGate))
  errors.push('依赖锁缺失实际基准校验：m1-public-lock-sync.yml')
const matrix = yaml('ci-test-matrix.yml')
if (!/needs:\s*\[inventory, build, core, supplemental, oracle\]/.test(matrix) ||
    !/if:\s*always\(\)/.test(matrix) ||
    !/\[\[ "\$\{result\}" != success \]\]/.test(matrix)) {
  errors.push('全量测试缺少失败汇总门禁：ci-test-matrix.yml')
}
if (/^ {4}paths(?:-ignore)?:/m.test(matrix.split(/^ {2}pull_request:/m)[1]?.split(/^ {2}(?:push|workflow_dispatch):/m)[0] ?? ''))
  errors.push('全量测试门禁不得过滤 PR 路径：ci-test-matrix.yml')
if (existsSync(root('tests/m6-ultrareview-cli-native-parity-317.test.mjs')))
  errors.push('已退役 Ultrareview CLI 原生对照测试仍存在')

if (errors.length) {
  for (const error of errors) console.error(`[ci-gate] ${error}`)
  process.exitCode = 1
} else {
  console.log(`[ci-gate] 现行门禁、旧分支清理及真实对照检查通过，共 ${workflows.length} 条工作流`)
}
