import type { Command } from '../../commands.js'

const stats = {
  type: 'local-jsx',
  name: 'stats',
  description: '查看 333 会话统计与活动',
  load: () => import('./stats.js'),
} satisfies Command

export default stats
