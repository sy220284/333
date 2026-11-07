import type { Message } from '../types/message.js'
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
