import { createHash } from 'node:crypto'
import type { Message } from '../../types/message.js'

/** Store only a fingerprint. Tool arguments can contain sensitive data. */
export function permissionDenialKey(tool: string, cwd: string, input: unknown): string {
  const sorted = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sorted)
    if (!value || typeof value !== 'object') return value
    const fields = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(fields).sort().map(key => [key, sorted(fields[key])]))
  }
  return createHash('sha256').update(JSON.stringify([tool, cwd, sorted(input)])).digest('hex')
}

/** Count consecutive permission decisions for the same request, across resume. */
export function countRecentPermissionDenials(
  messages: readonly Message[], key: string, maxResults = 12,
): number {
  let denied = 0
  for (let i = messages.length - 1; i >= 0 && denied < maxResults; i--) {
    const message = messages[i]
    if (message.type !== 'user') continue
    if (message.permissionDenialKey === key) {
      denied++
      continue
    }
    const hasResult = Array.isArray(message.message.content) &&
      message.message.content.some(block => block.type === 'tool_result')
    if (hasResult || (!message.isMeta && !message.sourceToolAssistantUUID)) break
  }
  return denied
}

export function permissionDenialLoopGuidance(priorDenials: number): string | undefined {
  if (priorDenials < 2) return undefined
  return `REPEATED PERMISSION DENIAL (${priorDenials + 1} consecutive attempts): ` +
    'Stop retrying this operation, including commands with different flags, alternative tools or scripts. ' +
    'Preserve the files and continue independent permitted tasks. ' +
    'If the denied operation is essential, ask the user to approve it.'
}
