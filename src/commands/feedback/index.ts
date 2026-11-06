import type { Command } from '../../commands.js'

/** 333 feedback is a local-only report, optionally exported by the user. */
const feedback = {
  aliases: ['bug'],
  type: 'local-jsx',
  name: 'feedback',
  description: '将问题反馈保存到本机 333 诊断目录',
  argumentHint: '<问题描述>',
  isEnabled: () => true,
  load: () => import('./feedback.js'),
} satisfies Command

export default feedback
