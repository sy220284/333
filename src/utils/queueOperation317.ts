/**
 * Claude Code 2.1.317 queue journal shape (official E5o/s and $pe).
 * Keep content text-only, and retain the delivery and removal identifiers used
 * to reconcile interrupted turns and queued peer notifications on resume.
 */
import type { QueueOperation, QueueOperationMessage } from '../types/messageQueueTypes.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
type QueueJournalCommand317 = Partial<QueuedCommand> & { pluginQueueRecordHookActive?: boolean }
export function createQueueOperationRecord(
  operation: QueueOperation, command: QueueJournalCommand317 | undefined,
  sessionId: string, now = new Date(), metadata: {reason?: string} = {},
): QueueOperationMessage {
  // Official $pe: submitted text has priority; unapproved prompt text and
  // queue-record plugin owned content are kept out of the transcript journal.
  const screening = command?.screeningPending === true || command?.screeningOwed === true
  const isPluginOwned = command?.mode === 'prompt' && command?.pluginQueueRecordHookActive === true
  const content = typeof command?.promptSubmitted?.text === 'string'
    ? command.promptSubmitted.text
    : typeof command?.value === 'string' && !screening && !isPluginOwned
      ? command.value
      : undefined

  // Official E5o/s writes the UUID and delivery receipt only for 'remove'.
  // 'dequeue' is intentionally metadata-free; 'enqueue' and 'popAll' carry
  // only the submitted text, never the queue's internal identifiers.
  const isRemoval = operation === 'remove'
  const hasText = operation !== 'dequeue' && metadata.reason !== 'dropped_by_hook'
  const uuid = isRemoval ? command?.attachmentSourceUuid ?? command?.uuid : undefined
  return {
    type: 'queue-operation',
    operation,
    timestamp: now.toISOString(),
    sessionId,
    ...(hasText && content !== undefined && { content }),
    ...(isRemoval && metadata.reason !== undefined && { reason: metadata.reason }),
    ...(isRemoval && uuid !== undefined && { commandUuid: uuid }),
    ...(isRemoval && command?.deliveryId !== undefined && { deliveryId: command.deliveryId }),
  }
}

/**
 * Restore traceability of messages discarded on Escape/cancellation. As in
 * the official queue, unlogged and still-screening commands have no journal.
 */
export function createDiscardedQueueRecords(commands, sessionId, reason = 'cleared_on_cancel', now = new Date()) {
  return commands
    .filter(command => !command.unlogged && command.screeningPending !== true)
    .map(command => createQueueOperationRecord('remove', command, sessionId, now, { reason }))
}

/** Select dropped commands before mutating queue state; keep() may throw safely. */
export function partitionQueueForClear(commands, keep) {
  const retained = []
  const discarded = []
  for (const command of commands) {
    if (keep?.(command)) retained.push(command)
    else discarded.push(command)
  }
  return { retained, discarded }
}
