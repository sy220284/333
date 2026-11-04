import type { QueueOperation, QueueOperationMessage } from '../types/messageQueueTypes.js'
import type { QueuedCommand } from '../types/textInputTypes.js'

export declare function createQueueOperationRecord(
  operation: QueueOperation,
  command: QueuedCommand | undefined,
  sessionId: string,
  now?: Date,
  metadata?: { reason?: string },
): QueueOperationMessage

export declare function createDiscardedQueueRecords(
  commands: readonly QueuedCommand[],
  sessionId: string,
  reason?: string,
  now?: Date,
): QueueOperationMessage[]

export declare function partitionQueueForClear(
  commands: readonly QueuedCommand[],
  keep?: (command: QueuedCommand) => boolean,
): { retained: QueuedCommand[]; discarded: QueuedCommand[] }
