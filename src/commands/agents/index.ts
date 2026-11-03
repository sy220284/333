import type { Command } from '../../commands.js'

// Claude Code 2.1.310 keeps /agents as a hidden information-only command.
// The old Ink wizard is retired; agent configuration and CLI management remain.
const agents = {
  type: 'local',
  name: 'agents',
  description: '旧版代理配置向导已移除，请使用 Claude 或配置文件管理代理',
  isHidden: true,
  supportsNonInteractive: true,
  load: async () => ({
    call: async () => ({
      type: 'text' as const,
      value: [
        '旧版 /agents 图形向导已移除。',
        '',
        '可以直接让 Claude 创建或更新子代理，也可以编辑以下配置文件：',
        '  • .claude/agents/       （当前项目）',
        '  • ~/.claude/agents/     （所有项目）',
        '',
        '说明：https://code.claude.com/docs/en/sub-agents',
      ].join('\n'),
    }),
  }),
} satisfies Command

export default agents
