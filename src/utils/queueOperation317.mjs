/**
 * Persist queue operations with the command identity needed to correlate
 * enqueue and removal across model/tool turns and session recovery.
 */
export function createQueueOperationRecord(operation, command, sessionId, now = new Date()) {
  return {
    type: 'queue-operation',
    operation,
    timestamp: now.toISOString(),
    sessionId,
    ...(typeof command?.value === 'string' && { content: command.value }),
    ...(command?.uuid && { commandUuid: command.uuid }),
  }
}
