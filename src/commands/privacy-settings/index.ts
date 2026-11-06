import type { Command } from '../../commands.js'

const privacySettings = {
  type: 'local',
  name: 'privacy-settings',
  description: '查看及设置本机隐私级别，所有设置保存在本地',
  argumentHint: '[status|default|no-telemetry|essential-traffic]',
  supportsNonInteractive: true,
  load: () => import('./privacy-settings.js'),
} satisfies Command

export default privacySettings
