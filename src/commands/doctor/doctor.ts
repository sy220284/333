/** Shared diagnosis exposed as a renderer-neutral slash command. */
import type { LocalCommandCall } from '../../types/command.js'
import { getDoctorDiagnostic } from '../../utils/doctorDiagnostic.js'

export const call: LocalCommandCall = async () => {
  const info = await getDoctorDiagnostic()
  const lines = [
    '摇摇车系统诊断',
    '版本：' + info.version,
    '安装方式：' + info.installationType,
    '安装路径：' + info.installationPath,
    '搜索工具：' + (info.ripgrepStatus.working ? '正常' : '异常'),
    ...info.warnings.flatMap(warning => ['问题：' + warning.issue, '建议：' + warning.fix]),
  ]
  return { type: 'text', value: lines.join('\n') }
}
