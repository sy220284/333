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

test('帮助页标题固定为中文，内部导航标识保持不变', () => {
  const ui = read('src/components/HelpV2/HelpV2.tsx')
  for (const [id, title] of [['general', '概览'], ['commands', '命令'], ['custom-commands', '自定义命令']]) {
    assert.ok(ui.includes(`id="${id}" title="${title}"`))
  }
  assert.match(read('src/components/PromptInput/PromptInputHelpMenu.tsx'), /双击 Esc 清空输入/)
})

test('权限确认和模型选择的可见文案使用中文', () => {
  assert.match(read('src/components/TrustDialog/TrustDialog.tsx'), /我信任此目录/)
  assert.match(read('src/components/permissions/FallbackPermissionRequest.tsx'), /label: "允许"/)
  assert.match(read('src/components/ModelPicker.tsx'), /选择模型/)
  assert.match(read('src/components/OutputStylePicker.tsx'), /回答风格/)
})

test('信任对话框没有遗留英文句段', () => {
  const dialog = read('src/components/TrustDialog/TrustDialog.tsx')
  assert.match(dialog, /Claude Code 将能够读取、修改并执行此目录中的文件/)
  assert.doesNotMatch(dialog, /Quick safety check|Yes, I trust this folder|No, exit/)
})
