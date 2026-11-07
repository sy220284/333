import type { Message } from '../types/message.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import { hasUltrathinkKeyword } from '../utils/thinking.js'

/**
 * Detect a deliberate ultrathink request for this human turn. Tool results,
 * meta reminders and quoted/path mentions must not carry an older turn's
 * boost into a new request. The caller also enforces the runtime feature gate
 * and excludes subagent work.
 */
export function turnRequestsUltrathink(
  messages: readonly Message[],
): boolean {
  for (let index=messages.length-1; index>=0; index--) {
    const message=messages[index]
    if (message.type!=='user' || message.isMeta || message.sourceToolUseID) continue
    const content=message.message.content
    let text:string
    if (typeof content==='string') text=content
    else {
      const humanText=content.filter(block=>block.type==='text').map(block=>block.text)
      if (humanText.length===0) continue
      text=humanText.join('\n')
    }
    return hasUltrathinkKeyword(text)
  }
  return false
}

/**
 * The 317 terminal also accepts a boost submitted WHILE a turn is running.
 * A queued human prompt is the only permitted source; shell commands,
 * subagent notifications and tool responses cannot change model effort.
 */
export function queuedTurnRequestsUltrathink(
  commands: readonly QueuedCommand[],
): boolean {
  return commands.some(command =>
    command.mode === 'prompt' &&
    !command.isMeta &&
    !command.screeningPending &&
    (command.origin === undefined || command.origin.kind === 'human') &&
    command.agentId === undefined &&
    hasUltrathinkKeyword(
      command.preExpansionValue ??
      (typeof command.value === 'string' ? command.value : ''),
    ),
  )
}
