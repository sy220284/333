import type { Command } from '../../commands.js'

const agents = {
  type: 'local-jsx',
  name: 'agents',
  description: '智能体协作中心：主从模式、超级智能体团队、成员和任务管理',
  argumentHint: '[status|mode master|super|list|team-create|team-delete|missions]',
  load: () => import('./agents.js'),
} satisfies Command

export default agents
