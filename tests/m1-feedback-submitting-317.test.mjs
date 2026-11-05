import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('333：用户显式输入问题后才生成本地反馈报告', () => {
  const feedback = read('../src/commands/feedback/feedback.ts')
  assert.match(feedback, /if \(!description\)/)
  assert.match(feedback, /await writeFile\(destination/)
  assert.match(feedback, /mode: 0o600/)
  assert.match(feedback, /flag: 'wx'/)
  assert.match(feedback, /本地诊断已导出/)
  assert.doesNotMatch(feedback, /axios|https?:\/\//)
})

test('333：已停用官方会话分享，明确返回未上传', () => {
  const share = read('../src/components/FeedbackSurvey/submitTranscriptShare.ts')
  assert.match(share, /success: false/)
  assert.doesNotMatch(share, /fetch\(|axios|api\.anthropic\.com/)
})
