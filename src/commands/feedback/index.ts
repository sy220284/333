import type { Command } from '../../commands.js'

const feedback = {
  type: 'local',
  name: 'feedback',
  aliases: ['bug'],
  description: '将问题反馈和本地诊断导出到 333 配置目录，不向任何服务发送',
  argumentHint: '<问题描述>',
  supportsNonInteractive: true,
  load: () => import('./feedback.js'),
} satisfies Command

export default feedback
