import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const source = path => readFileSync(resolve(root, path), 'utf8')

test('GitHub PR 创建默认不指定原厂审查人，生成中文标题和描述', () => {
  const command = source('src/commands/commit-push-pr.ts')
  assert.doesNotMatch(command, /--(?:add-)?reviewer anthropics\/claude-code/)
  assert.match(command, /PR title and full description in Chinese/)
  assert.match(command, /## 变更摘要/)
  assert.match(command, /## 验证结果/)
})

test('欢迎界面根据当前模型供应商显示账号或 API 计费', () => {
  const logo = source('src/utils/logoV2Utils.ts')
  assert.match(logo, /resolveIndependentModel\(getMainLoopModel\(\)\)/)
  assert.match(logo, /provider === 'chatgpt'/)
  assert.match(logo, /API 用量计费/)
})

test('费用命令按照正在使用的模型判断订阅与 API', () => {
  const cost = source('src/commands/cost/cost.ts')
  assert.match(cost, /!resolveIndependentModel\(getMainLoopModel\(\)\) && isClaudeAISubscriber\(\)/)
  assert.doesNotMatch(cost, /your Claude Code usage/)
})
