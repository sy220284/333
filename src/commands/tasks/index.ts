import type { Command } from '../../commands.js'

const tasks = {
  type: 'local-jsx',
  name: 'tasks',
  description: '统一后台任务管理：正在执行的任务、工作流与历史记录',
  load: () => import('./tasks.js'),
} satisfies Command

export default tasks
