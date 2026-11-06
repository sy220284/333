/**
 * 333 本地诊断事件汇总。仅在当前进程内保存事件名称与次数，
 * 不保存提示词、路径、令牌、消息正文，也不建立外部统计连接。
 */
import { attachAnalyticsSink } from './index.js'

const MAX_EVENT_TYPES = 128
const eventCounts = new Map<string, number>()
type LocalEventMetadata = { [key: string]: boolean | number | undefined }

function recordLocalEvent(eventName: string, _metadata: LocalEventMetadata): void {
  // 只接受已登记事件名称；防止任意模型输出进入诊断档案。
  if (!/^[a-z][a-z0-9_]{0,96}$/.test(eventName)) return
  if (!eventCounts.has(eventName) && eventCounts.size >= MAX_EVENT_TYPES) return
  eventCounts.set(eventName, (eventCounts.get(eventName) ?? 0) + 1)
}

/** 本地诊断可选择导出的事件计数，不包含事件参数。 */
export function getLocalDiagnosticEventCounts(): Record<string, number> {
  return Object.fromEntries(eventCounts)
}

/** 兼容初始化调用：所有功能开关在本地解析，不查询远程实验平台。 */
export function initializeAnalyticsGates(): void {}

export function initializeAnalyticsSink(): void {
  attachAnalyticsSink({
    logEvent: recordLocalEvent,
    logEventAsync: async (eventName, metadata) => recordLocalEvent(eventName, metadata),
  })
}
