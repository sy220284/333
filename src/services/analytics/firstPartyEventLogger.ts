/**
 * 333 将官方事件上传通道关闭，保留已广泛引用的函数签名，
 * 让日志与性能统计通过独立的本地诊断模块处理。
 */
export type EventSamplingConfig = Record<string, { sample_rate: number }>
export function getEventSamplingConfig(): EventSamplingConfig { return {} }
export function shouldSampleEvent(_eventName: string): number | null { return null }
export function is1PEventLoggingEnabled(): boolean { return false }
export function logEventTo1P(
  _eventName: string,
  _metadata: Record<string, number | boolean | undefined> = {},
): void {}
export type GrowthBookExperimentData = {
  experimentId: string
  variationId: number
  userAttributes?: import('./growthbook.js').GrowthBookUserAttributes
  experimentMetadata?: Record<string, unknown>
}
export function logGrowthBookExperimentTo1P(_data: GrowthBookExperimentData): void {}
export function initialize1PEventLogging(): void {}
export async function shutdown1PEventLogging(): Promise<void> {}
export async function reinitialize1PEventLoggingIfConfigChanged(): Promise<void> {}
