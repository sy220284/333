/**
 * 会话队列操作日志：由 messageQueueManager.logOperation 创建，
 * sessionStorage.insertQueueOperation 按原字段直接序列化。
 *
 * 源码恢复依据：2.1.88 src/utils/messageQueueManager.ts:28-38,
 * 131-145,191,209,263,290,311,472；
 * src/utils/sessionStorage.ts:1101-1105,1218。
 *
 * 只包含消费者实际写入的操作和字段；避免宽泛 string
 * 使序列化与日志回放无法校验。
 */
export type QueueOperation = 'enqueue' | 'dequeue' | 'remove' | 'popAll'

export type QueueOperationMessage = {
  type: 'queue-operation'
  operation: QueueOperation
  timestamp: string
  sessionId: string
  content?: string
}
