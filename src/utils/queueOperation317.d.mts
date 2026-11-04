import type { QueueOperation, QueueOperationMessage } from '../types/messageQueueTypes.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
export declare function createQueueOperationRecord(
  operation: QueueOperation,
  command: QueuedCommand | undefined,
  sessionId: string,
  now?: Date,
): QueueOperationMessage
