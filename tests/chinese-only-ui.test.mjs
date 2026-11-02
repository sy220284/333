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

test('聊天输入、语音、通知状态保持中文文案', () => {
  assert.match(read('src/components/PromptInput/Notifications.tsx'), /尚未登录 · 请运行 \/login/)
  assert.match(read('src/components/PromptInput/VoiceIndicator.tsx'), /正在聆听/)
  assert.match(read('src/components/TokenWarning.tsx'), /上下文空间不足/)
  assert.match(read('src/components/PromptInput/PromptInputStashNotice.tsx'), /已暂存/)
})

test('设置项仅以中文显示状态，内部数据类型不变', () => {
  const settings = read('src/components/Settings/Config.tsx')
  assert.match(settings, /setting_2.value \? '开启' : '关闭'/)
  assert.match(settings, /getChineseSettingValue\(setting_2.id, setting_2.value.toString\(\)\)/)
  assert.match(settings, /getChinesePermissionMode\(setting_2.value as PermissionMode\)/)
})
test('授权与认证弹窗显示中文', () => {
  assert.match(read('src/components/ApproveApiKey.tsx'), /检测到环境中配置了自定义 API 密钥/)
  assert.match(read('src/components/AwsAuthStatusBox.tsx'), /云服务身份验证/)
  assert.match(read('src/components/AutoModeOptInDialog.tsx'), /启用自动模式？/)
})

test('权限告警、插件推荐和开发渠道界面显示中文且行为标识不变', () => {
  assert.match(read('src/components/BypassPermissionsModeDialog.tsx'), /跳过权限确认模式/)
  assert.match(read('src/components/ClaudeMdExternalIncludesDialog.tsx'), /允许 CLAUDE\.md 引用外部文件吗/)
  assert.match(read('src/components/ClaudeCodeHint/PluginHintMenu.tsx'), /插件推荐/)
  assert.match(read('src/components/DevChannelsDialog.tsx'), /正在加载开发频道/)
  assert.match(read('src/components/ChannelDowngradeDialog.tsx'), /切换至稳定渠道/)
  assert.match(read('src/components/CostThresholdDialog.tsx'), /本次会话已使用 5 美元/)
})

test('登录、导出、思考设置和语音提示使用中文', () => {
  assert.match(read('src/components/ConsoleOAuthFlow.tsx'), /请选择登录方式/)
  assert.match(read('src/components/ExportDialog.tsx'), /导出对话/)
  assert.match(read('src/components/ThinkingToggle.tsx'), /切换思考模式/)
  assert.match(read('src/components/InvalidConfigDialog.tsx'), /配置错误/)
  assert.match(read('src/commands/voice/voice.ts'), /语音识别服务目前不支持/)
})

test('上下文用量页面各类项目均为中文', () => {
  const ui = read('src/components/ContextVisualization.tsx')
  assert.match(ui, /上下文用量/)
  assert.match(ui, /各类别用量估算/)
  assert.match(ui, /自定义代理/)
})
