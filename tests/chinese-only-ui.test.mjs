import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split('//# sourceMappingURL=')[0]
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

test('历史会话选择、代码回退和工作树退出中文化', () => {
  assert.match(read('src/components/MessageSelector.tsx'), /恢复代码与对话/)
  assert.match(read('src/components/LogSelector.tsx'), /恢复会话/)
  assert.match(read('src/components/WorktreeExitDialog.tsx'), /正在退出工作树会话/)
})

test('重要交互：反馈、托管设置、MCP 审批、插件推荐中文化', () => {
  assert.match(read('src/components/Feedback.tsx'), /提交反馈或问题报告/)
  assert.match(read('src/components/ManagedSettingsSecurityDialog/ManagedSettingsSecurityDialog.tsx'), /需要确认的设置/)
  assert.match(read('src/components/MCPServerApprovalDialog.tsx'), /仅允许此 MCP 服务器/)
  assert.match(read('src/components/InvalidSettingsDialog.tsx'), /设置错误/)
  assert.match(read('src/components/LspRecommendation/LspRecommendationMenu.tsx'), /LSP 插件推荐/)
})

test('插件管理页面保留内部标签标识并使用中文', () => {
  const ui=read('src/commands/plugin/PluginSettings.tsx')
  assert.match(ui, /id="discover" title="发现插件"/)
  assert.match(ui, /id="installed" title="已安装"/)
  assert.match(ui, /id="marketplaces" title="插件市场"/)
  assert.match(read('src/commands/plugin/DiscoverPlugins.tsx'), /发现插件/)
  assert.match(read('src/components/mcp/MCPStdioServerMenu.tsx'), /查看工具/)
})

test('搜索、IDE 接入及远程控制界面文案为中文', () => {
  assert.match(read('src/components/GlobalSearchDialog.tsx'), /全局搜索/)
  assert.match(read('src/components/QuickOpenDialog.tsx'), /快速打开/)
  assert.match(read('src/components/IdeAutoConnectDialog.tsx'), /IDE 自动连接/)
  assert.match(read('src/components/RemoteCallout.tsx'), /远程控制/)
  assert.match(read('src/components/HistorySearchDialog.tsx'), /搜索历史输入/)
})

test('统计面板中文标签与内部标签 ID 保持一致', () => {
  const s=read('src/components/Stats.tsx')
  assert.match(s, /<Tab id="Overview" title="概览">/)
  assert.match(s, /<Tab id="Models" title="模型">/)
  assert.match(s, /defaultTab="Overview"/)
  assert.match(read('src/components/LogoV2/ChannelsNotice.tsx'), /频道功能当前不可用/)
})

test('代理创建、权限与工具选择界面使用中文', () => {
  assert.match(read('src/components/agents/AgentsList.tsx'), /创建新代理/)
  assert.match(read('src/components/agents/AgentsMenu.tsx'), /删除代理/)
  assert.match(read('src/components/agents/ToolSelector.tsx'), /所有工具/)
  assert.match(read('src/components/agents/new-agent-creation/CreateAgentWizard.tsx'), /创建新代理/)
})

test('沙箱标签和代理创建向导中文化且 Tab 内部标识稳定', () => {
  const s=read('src/components/sandbox/SandboxSettings.tsx')
  assert.match(s, /id="Mode" title="模式"/)
  assert.match(s, /id="Config" title="配置"/)
  assert.match(s, /defaultTab="Mode"/)
  assert.match(read('src/components/agents/new-agent-creation/wizard-steps/ConfirmStep.tsx'), /系统提示词/)
})

test('权限审批与文件夹授权界面显示中文且规则 ID 不变', () => {
  const ui=read('src/components/permissions/rules/PermissionRuleList.tsx')
  assert.match(ui,/id="allow" title="允许"/)
  assert.match(ui,/id="deny" title="拒绝"/)
  assert.match(read('src/components/permissions/EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.tsx'), /进入规划模式/)
  assert.match(read('src/components/permissions/rules/AddWorkspaceDirectory.tsx'), /将目录添加到工作区/)
})

test('macOS 权限设置深链保持系统原始标识', () => {
  const src = read('src/components/permissions/ComputerUseApproval/ComputerUseApproval.tsx')
  assert.match(src, /Privacy_Accessibility/)
  assert.doesNotMatch(src, /Privacy_辅助功能/)
})

test('MCP 远程连接和远程会话详情使用中文', () => {
  assert.match(read('src/components/mcp/MCPRemoteServerMenu.tsx'), /正在验证/)
  assert.match(read('src/components/tasks/RemoteSessionDetailDialog.tsx'), /远程会话详情/)
})

test('沙箱依赖与代理位置设置使用中文显示', () => {
  const dependencies=read('src/components/sandbox/SandboxDependenciesTab.tsx')
  assert.match(dependencies, /未安装/)
  assert.match(dependencies, /已找到/)
  assert.match(read('src/components/agents/new-agent-creation/wizard-steps/LocationStep.tsx'), /项目级/)
})

test('远程会话、差异查看和代理向导的中文提示', () => {
  assert.match(read('src/components/TeleportProgress.tsx'), /正在验证会话/)
  assert.match(read('src/components/TeleportStash.tsx'), /工作目录存在更改/)
  assert.match(read('src/components/diff/DiffDetailView.tsx'), /二进制文件，无法显示差异/)
  assert.match(read('src/components/agents/new-agent-creation/wizard-steps/PromptStep.tsx'), /系统提示词/)
  assert.match(read('src/components/agents/new-agent-creation/wizard-steps/MemoryStep.tsx'), /不保存长期记忆/)
})

test('MCP 服务器、钩子和监控权限提示为中文', () => {
  assert.match(read('src/components/mcp/MCPListPanel.tsx'), /管理 MCP 服务器/)
  assert.match(read('src/components/mcp/MCPToolDetailView.tsx'), /工具名称/)
  assert.match(read('src/components/hooks/ViewHookMode.tsx'), /钩子详情/)
  assert.match(read('src/components/permissions/MonitorPermissionRequest/MonitorPermissionRequest.tsx'), /后台监控与通知/)
})

test('网络访问、工作区权限和规划批准使用中文提示', () => {
  assert.match(read('src/components/permissions/WebFetchPermissionRequest/WebFetchPermissionRequest.tsx'), /允许 Claude 获取此内容/)
  assert.match(read('src/components/permissions/SandboxPermissionRequest.tsx'), /沙箱外网络连接请求/)
  assert.match(read('src/components/permissions/rules/RemoveWorkspaceDirectory.tsx'), /从工作区移除此目录/)
  assert.match(read('src/components/messages/PlanApprovalMessage.tsx'), /规划模式的限制已解除/)
})
