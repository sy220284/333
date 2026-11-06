import { formatTotalCost } from '../../cost-tracker.js'
import { getLocalDiagnosticEventCounts } from '../../services/analytics/sink.js'
import { saveLocalFeedback, type LocalFeedbackDiagnostics } from '../../services/localRuntime/feedbackReports.js'
import type { LocalCommandCall } from '../../types/command.js'

/** /feedback 仅在用户明确提交时导出本地记录。 */
export const call: LocalCommandCall = async (args, context) => {
  const description = args.trim()
  if (!description) {
    return { type: 'text', value: '使用方法：/feedback <问题描述>。诊断报告保存于本机 ~/.333/feedback，供检查后分享。' }
  }
  const state = context.getAppState()
  const diagnostics: LocalFeedbackDiagnostics = {
    environment: {
      version: MACRO.VERSION,
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      activeModel: state.mainLoopModel ?? null,
    },
    currentSessionCost: formatTotalCost(),
    localEventCounts: getLocalDiagnosticEventCounts(),
  }
  const path = await saveLocalFeedback(description, diagnostics)
  return {
    type: 'text',
    value: `本地 diagnostics 反馈已导出：${path}\n文件尚未上传；分享前请检查描述内容。`,
  }
}
