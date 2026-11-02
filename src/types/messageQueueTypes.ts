import type { UUID } from 'node:crypto'

/** Session transcript event emitted by the unified command queue manager. */
export type QueueOperation = 'enqueue' | 'dequeue' | 'remove' | 'popAll'

export type QueueOperationMessage = {
  type: 'queue-operation'
  operation: QueueOperation
  timestamp: string
  sessionId: UUID
  content?: string
}
