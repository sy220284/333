import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').split('//# sourceMappingURL=')[0]
test('简体中文是唯一有效语言', () => {
  assert.match(read('src/utils/settings/settings.ts'), /language: '简体中文'/)
  assert.match(read('src/constants/prompts.ts'), /Always respond in Simplified Chinese/)
  assert.doesNotMatch(read('src/components/Settings/Config.tsx'), /LanguagePicker|setShowSubmenu\('Language'\)|Default \(English\)/)
  assert.match(read('src/components/Settings/Config.tsx'), /显示语言：简体中文（固定）/)
})
test('设置标签保留原内部标识，向用户显示中文', () => {
  for (const [id, title] of [['Status', '状态'], ['Config', '设置'], ['Usage', '用量']]) {
    assert.ok(read('src/components/Settings/Settings.tsx').includes(`id="${id}" title="${title}"`))
  }
})
test('日期与时间强制简体中文', () => {
  assert.match(read('src/utils/formatBriefTimestamp.ts'), /const locale = 'zh-CN'/)
  assert.match(read('src/utils/intl.ts'), /RelativeTimeFormat\('zh-CN'/)
})
