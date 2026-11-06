import type { Message } from '../../types/message.js'

/**
 * Count an uninterrupted sequence of permission denials at the end of the
 * current conversation. This uses the actual transcript rather than an
 * in-memory counter, so session restore retains the same safety boundary.
 * A successful tool call or a new user instruction resets the sequence.
 */
export function countRecentPermissionDenials(messages: readonly Message[], maxResults = 12): number {
  let denied = 0
  let inspected = 0
  for (let i = messages.length - 1; i >= 0 && inspected < maxResults; i--) {
    const message = messages[i]
    if (message.type !== 'user') continue
    const blocks = Array.isArray(message.message.content)
      ? message.message.content.filter(block => block.type === 'tool_result')
      : []
    if (!blocks.length) {
      // A fresh human instruction starts a new requested operation.
      if (!message.isMeta && !message.sourceToolAssistantUUID) break
      continue
    }
    for (let j = blocks.length - 1; j >= 0 && inspected < maxResults; j--) {
      inspected++
      const block = blocks[j]
      if (block.is_error !== true || typeof block.content !== 'string') return denied
      const reason = block.content.trim()
      if (!/^(Permission (?:to use|for this action|for this tool use)|The user doesn't want to proceed with this tool use|The user doesn't want to take this action|Error:\s*Permission denied)/i.test(reason)) return denied
      denied++
    }
  }
  return denied
}

export function permissionDenialLoopGuidance(priorDenials: number): string | undefined {
  if (priorDenials < 2) return undefined
  return `REPEATED PERMISSION DENIAL (${priorDenials + 1} consecutive attempts): ` +
    'Stop retrying this operation, including commands with different flags, alternative tools or scripts. ' +
    'Preserve the files and continue independent permitted tasks. ' +
    'If the denied operation is essential, ask the user to approve it. '
}
