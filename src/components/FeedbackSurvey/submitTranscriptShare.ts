/** 333 停止向 Claude 官方上传整段会话。 */
import type { Message } from '../../types/message.js'

export type TranscriptShareTrigger =
  | 'bad_feedback_survey'
  | 'good_feedback_survey'
  | 'frustration'
  | 'memory_survey'

/**
 * 官方会话分享功能已退出产品。使用 /feedback 将诊断保存到本地。
 * 返回显式的失败结果，避免把会话或子代理记录发送到原平台。
 */
export async function submitTranscriptShare(
  _messages: Message[],
  _trigger: TranscriptShareTrigger,
  _appearanceId: string,
): Promise<{ success: false }> {
  return { success: false }
}
