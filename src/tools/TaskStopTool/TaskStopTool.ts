import { isStoppableTask } from '../../tasks/agentLifecycle317.js'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  stopTask,
  resolveTaskToStop,
  StopTaskError,
} from '../../tasks/stopTask.js'
import { getAgentId } from '../../utils/teammate.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  DESCRIPTION,
  TASK_STOP_TOOL_NAME,
  TASK_STOP_ALIASES,
} from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    task_id: z
      .string()
      .optional()
      .describe(
        'The ID of the background task to stop. Agent-team teammates and named background agents are also accepted by agent ID or name.',
      ),
    shell_id: z.string().optional().describe('Deprecated: use task_id instead'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    message: z.string().describe('Status message about the operation'),
    task_id: z.string().describe('The ID of the task that was stopped'),
    task_type: z.string().describe('The type of the task that was stopped'),
    // Optional: tool outputs are persisted to transcripts and replayed on --resume
    // without re-validation, so sessions from before this field was added lack it.
    command: z
      .string()
      .optional()
      .describe('The command or description of the stopped task'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const TaskStopTool = buildTool({
  name: TASK_STOP_TOOL_NAME,
  aliases: [...TASK_STOP_ALIASES],
  searchHint: 'kill a running background task',
  maxResultSizeChars: 100_000,
  userFacingName: () => 'Stop Task',
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  shouldDefer: true,
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.task_id ?? input.shell_id ?? ''
  },
  async validateInput({ task_id, shell_id }, { getAppState }) {
    const id = task_id ?? shell_id
    if (!id)
      return {
        result: false,
        message: 'Missing required parameter: task_id',
        errorCode: 1,
      }
    try {
      const task = resolveTaskToStop(id, getAppState())
      if (!isStoppableTask(task, getAppState().tasks))
        return {
          result: false,
          message: `Task ${id} is not running (status: ${task.status})`,
          errorCode: 3,
        }
      return { result: true }
    } catch (error) {
      if (!(error instanceof StopTaskError)) throw error
      return { result: false, message: error.message, errorCode: 1 }
    }
  },
  async description() {
    return `Stop a running background task by ID`
  },
  async prompt() {
    return DESCRIPTION
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: jsonStringify(output),
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  async call(
    { task_id, shell_id },
    { getAppState, setAppState, setAppStateForTasks, agentId },
  ) {
    const id = task_id ?? shell_id
    if (!id) throw new Error('Missing required parameter: task_id')
    const result = await stopTask(id, {
      callerAgentId: agentId ?? getAgentId(),
      getAppState,
      setAppState: setAppStateForTasks ?? setAppState,
    })

    return {
      data: {
        message: `Successfully stopped task: ${result.taskId} (${result.command})`,
        task_id: result.taskId,
        task_type: result.taskType,
        command: result.command,
      },
    }
  },
} satisfies ToolDef<InputSchema, Output>)
