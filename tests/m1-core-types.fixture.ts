/** 按旧版 queue log 和 fileSuggestion hook 消费者重建的正反向类型用例。 */
import type { QueueOperation, QueueOperationMessage } from '../src/types/messageQueueTypes.js'
import type { FileSuggestionCommandInput } from '../src/types/fileSuggestion.js'

const enqueue: QueueOperationMessage = {
  type: 'queue-operation',
  operation: 'enqueue',
  sessionId: 'session-a',
  timestamp: new Date(0).toISOString(),
  content: 'test',
}
const discard: QueueOperationMessage = {
  type: 'queue-operation',
  operation: 'remove',
  sessionId: 'session-a',
  timestamp: new Date(0).toISOString(),
}
const input: FileSuggestionCommandInput = {
  session_id: 'session-a',
  transcript_path: '/tmp/session.jsonl',
  cwd: '/workspace',
  query: 'file',
  permission_mode: 'default',
}
// @ts-expect-error queue operations are a closed union from the logger
const invalidQueueOperation: QueueOperation = 'drop'
// @ts-expect-error the persisted queue log always has a session identifier
const missingSession: QueueOperationMessage = { type: 'queue-operation', operation: 'dequeue', timestamp: '' }
// @ts-expect-error command suggestions always have a query
const noQuery: FileSuggestionCommandInput = { session_id: '', transcript_path: '', cwd: '' }
void [enqueue, discard, input, invalidQueueOperation, missingSession, noQuery]
