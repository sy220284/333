import React from 'react'
import type { RemoteAgentTaskState } from 'src/tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { DeepImmutable } from 'src/types/utils.js'
import { Text } from '../../ink.js'
import { count } from '../../utils/array.js'

export function RemoteSessionProgress({
  session,
}: {
  session: DeepImmutable<RemoteAgentTaskState>
}): React.ReactNode {
  if (session.status === 'completed') {
    return (
      <Text bold color="success" dimColor>
        done
      </Text>
    )
  }

  if (session.status === 'failed') {
    return (
      <Text bold color="error" dimColor>
        error
      </Text>
    )
  }

  if (!session.todoList.length) {
    return <Text dimColor>{session.status}…</Text>
  }

  const completed = count(session.todoList, _ => _.status === 'completed')
  const total = session.todoList.length
  return (
    <Text dimColor>
      {completed}/{total}
    </Text>
  )
}
