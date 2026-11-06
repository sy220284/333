import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { isProactiveActive } from '../../proactive/index.js'
import { DESCRIPTION, SLEEP_TOOL_NAME, SLEEP_TOOL_PROMPT } from './prompt.js'

const inputSchema = lazySchema(() => z.strictObject({
  duration_ms: z.number().int().min(1000).max(300000).default(60000)
    .describe('Wait between 1000 and 300000 milliseconds; user interruption stops the wait.'),
}))
const outputSchema = lazySchema(() => z.object({
  duration_ms: z.number(),
  result: z.string(),
}))
type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const SleepTool = buildTool({
  name: SLEEP_TOOL_NAME,
  searchHint: 'sleep without a shell process while waiting for task events',
  maxResultSizeChars: 2000,
  userFacingName() { return 'Sleep' },
  async description() { return DESCRIPTION },
  async prompt() { return SLEEP_TOOL_PROMPT },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isEnabled() { return isProactiveActive() },
  isReadOnly() { return true },
  isConcurrencySafe() { return true },
  renderToolUseMessage(input) { return `休眠 ${input.duration_ms} 毫秒` },
  async validateInput() { return { result: true as const } },
  async call({ duration_ms }, { abortController }) {
    const signal = abortController.signal
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      const cancel = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', cancel)
        reject(new Error('Sleep interrupted by user'))
      }
      if (signal.aborted) { reject(new Error('Sleep interrupted by user')); return }
      timer = setTimeout(() => {
        signal.removeEventListener('abort', cancel)
        resolve()
      }, duration_ms)
      signal.addEventListener('abort', cancel, { once: true })
    })
    return { data: { duration_ms, result: 'awake' } }
  },
} satisfies ToolDef<InputSchema, Output>)
