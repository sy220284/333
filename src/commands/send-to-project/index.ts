import type { Command } from '../../commands.js'

/** Official 2.1.317 /send-to-project: local-only, explicit user approval. */
const sendToProject = {
  type: 'local-jsx',
  name: 'send-to-project',
  description: '将当前会话摘要或一条消息发送到你拥有的 Claude 私有项目',
  argumentHint: '[要发送的消息]',
  availability: ['claude-ai'],
  supportsNonInteractive: false,
  load: () => import('./send-to-project.js'),
} satisfies Command

export default sendToProject
