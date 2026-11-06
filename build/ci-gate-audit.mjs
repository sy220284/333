#!/usr/bin/env node
/**
 * PR gate invariants, checked before any expensive build.
 * A retired test or an inert last-commit filter must not claim CI success.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const base = new URL('../', import.meta.url)
const root = file => new URL(file, base)
const directory = root('.github/workflows/')
const yaml = name => readFileSync(root('.github/workflows/' + name), 'utf8')
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
  if (!existsSync(root('.github/workflows/' + name))) {
    errors.push('缺失核心工作流：' + name)
    continue
  }
  if (!/^  pull_request:/m.test(yaml(name))) errors.push('PR 未触发：' + name)
}
const workflows = readdirSync(directory).filter(name => name.endsWith('.yml'))
for (const name of workflows) {
  const content = yaml(name)
  if (/upgrade\/2\.1\.310-m1-evidence/.test(content) && name !== 'rebuild.yml') {
    errors.push('旧升级分支依赖：' + name)
  }
}
for (const name of ['sdk-stream-parity.yml','m1-spinner-parity.yml']) {
  if (yaml(name).includes('git diff-tree --root')) errors.push('仅最后提交判断造成空跑：' + name)
  if (yaml(name).includes('/2.1.310/')) errors.push('旧版对照基准：' + name)
}
for (const name of ['m4-send-to-project-317.yml']) {
  if (workflows.includes(name)) errors.push('已删除功能工作流残留：' + name)
}
if (yaml('rebuild.yml').includes('m6-ultrareview-runtime-config-317.test.mjs')) {
  errors.push('已删除云审查门禁仍在全量构建中')
}
if (errors.length) {
  for (const error of errors) console.error('[ci-gate] ' + error)
  process.exitCode = 1
} else {
  console.log('[ci-gate] 现行门禁、旧分支清理及真实对照检查通过，共 ' + workflows.length + ' 条工作流')
}
