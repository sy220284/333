import type { Command } from '../../commands.js'
const github = {
  type: 'local',
  name: 'github',
  aliases: ['install-github-app'],
  description: 'GitHub 通用集成：授权、仓库、Actions、密钥、PR 与多模型审查',
  argumentHint: '[status|repos|setup|secret|review|runs]',
  supportsNonInteractive: false,
  load: () => import('./github.js'),
} satisfies Command
export default github
