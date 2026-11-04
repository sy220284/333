/**
 * Claude Code 2.1.317 queue journal shape (official E5o/s and $pe).
 * Keep content text-only, and retain the delivery and removal identifiers used
 * to reconcile interrupted turns and queued peer notifications on resume.
 */
export function createQueueOperationRecord(operation, command, sessionId, now = new Date(), metadata = {}) {
  const screening = command?.promptSubmitted === undefined &&
    (command?.screeningPending === true || command?.screeningOwed === true)
  const content = typeof command?.promptSubmitted?.text === 'string'
    ? command.promptSubmitted.text
    : typeof command?.value === 'string' && !screening ? command.value : undefined
  const uuid = operation === 'remove'
    ? command?.attachmentSourceUuid ?? command?.uuid
    : command?.uuid
  return {
    type: 'queue-operation',
    operation,
    timestamp: now.toISOString(),
    sessionId,
    ...(content !== undefined && metadata.reason !== 'dropped_by_hook' && { content }),
    ...(metadata.reason !== undefined && { reason: metadata.reason }),
    ...(uuid !== undefined && { commandUuid: uuid }),
    ...(command?.deliveryId !== undefined && { deliveryId: command.deliveryId }),
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
