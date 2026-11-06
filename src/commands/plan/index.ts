import type { Command } from '../../commands.js'

const plan = {
  type: 'local-jsx',
  name: 'plan',
  description: '统一任务规划入口：进入规划模式、查看计划和管理顾问模型',
  argumentHint: '[open|advisor <模型>|advisor off|<描述>]',
  load: () => import('./unified.js'),
} satisfies Command

export default plan
