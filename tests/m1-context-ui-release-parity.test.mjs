import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8').split('//# sourceMappingURL')[0]

test('新版上下文图表保留真实Token明细，不再请求旧式collapse状态', () => {
  const text = source('../src/components/ContextVisualization.tsx')
  assert.match(text, /generateContextSuggestions/)
  assert.match(text, /formatTokens\(totalTokens\)/)
  assert.doesNotMatch(text, /CollapseStatus|contextCollapse\/index/)
})

test('余量提示保留自动压缩和紧急提示，去除不存在的旧式折叠订阅', () => {
  const text = source('../src/components/TokenWarning.tsx')
  assert.match(text, /calculateTokenWarningState\(tokenUsage, model\)/)
  assert.match(text, /getEffectiveContextWindowSize\(model\)/)
  assert.match(text, /isAutoCompactEnabled/)
  assert.match(text, /REACTIVE_COMPACT/)
  assert.doesNotMatch(text, /CollapseLabel|contextCollapse\/index|collapseMode|useSyncExternalStore/)
})

test('会话回退仍写入目标消息边界和新的会话标识', () => {
  const text = source('../src/screens/REPL.tsx')
  assert.match(text, /setMessages\(prev\.slice\(0, messageIndex\)\)/)
  assert.match(text, /setConversationId\(randomUUID\(\)\)/)
  assert.doesNotMatch(text, /resetContextCollapse|contextCollapse\/index/)
})

test('会话恢复保留历史、工作树和文件指针，删除缺失的旧式折叠持久化入口', () => {
  const text = source('../src/screens/ResumeConversation.tsx')
  assert.match(text, /restoreWorktreeForResume\(result_3\.worktreeSession\)/)
  assert.match(text, /adoptResumedSessionFile\(\)/)
  assert.match(text, /setResumeData\(/)
  assert.doesNotMatch(text, /contextCollapse\/persist|restoreFromEntries/)
})
