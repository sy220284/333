import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { formatTotalCost } from '../../cost-tracker.js'
import { getLocalDiagnosticEventCounts } from '../../services/analytics/sink.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const MAX_DESCRIPTION_LENGTH = 10_000

/** 本地反馈：显式输入内容才生成文件，权限仅限当前用户。 */
export const call: LocalCommandCall = async (args, context) => {
  const description = args.trim()
  if (!description) {
    return { type: 'text', value: '使用方法：/feedback <问题描述>。报告只写入本机，请自行检查后再分享。' }
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { type: 'text', value: '反馈超过 10000 字符，请缩短后再导出。' }
  }
  const directory = join(getClaudeConfigHomeDir(), 'diagnostics')
  const filename = `333-feedback-${randomUUID()}.json`
  const destination = join(directory, filename)
  const appState = context.getAppState()
  const report = {
    product: '333',
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    description,
    environment: {
      version: MACRO.VERSION,
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      activeModel: appState.mainLoopModel ?? null,
    },
    currentSessionCost: formatTotalCost(),
    localEventCounts: getLocalDiagnosticEventCounts(),
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  return { type: 'text', value: `本地诊断已导出：${destination}\n文件尚未上传；分享前请检查描述内容。` }
}
