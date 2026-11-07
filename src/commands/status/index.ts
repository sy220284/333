import type { Command } from '../../commands.js'

const status = {
  type: 'local-jsx',
  name: 'status',
  description:
    '运行状态面板：模型、上下文、令牌、费用、统计与诊断',
  immediate: true,
  load: () => import('./status.js'),
} satisfies Command

export default status
