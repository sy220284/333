/**
 * Pure remote-review wire format shared by the CLI poller and its tests.
 * SDK hook progress/response events and assistant text must have the same
 * extraction semantics as the RemoteAgentTask completion path.
 */
export const REMOTE_REVIEW_TAG = 'remote-review'
export const REMOTE_REVIEW_PROGRESS_TAG = 'remote-review-progress'
const severitySymbol: Record<string, string> = {
  normal: '🔴',
  nit: '🟡',
  pre_existing: '🟣',
}
export function extractTag(text: string, tag: string): string | undefined {
  const startTag = '<' + tag + '>'
  const endTag = '</' + tag + '>'
  const end = text.lastIndexOf(endTag)
  if (end < 0) return undefined
  const start = text.lastIndexOf(startTag, end)
  return start >= 0 ? text.slice(start + startTag.length, end).trim() : undefined
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function textOfReviewEvent(event: unknown): string {
  if (!isRecord(event)) return ''
  if ((event.subtype === 'hook_response' || event.subtype === 'hook_progress') &&
    typeof event.stdout === 'string') return event.stdout
  if (event.type !== 'assistant') return ''
  const content = isRecord(event.message) ? event.message.content : undefined
  return Array.isArray(content)
    ? content.filter(isRecord).filter(part => part.type === 'text').map(part => part.text == null ? '' : String(part.text)).join('\n')
    : ''
}
export function extractLatestRemoteReview(events: readonly unknown[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const result = extractTag(textOfReviewEvent(events[i]), REMOTE_REVIEW_TAG)
    if (result) return result
  }
  // A hook can flush across two distinct events when stdout is large.
  const concatenated = events
    .filter(e => isRecord(e) && e.type === 'system' && typeof e.subtype === 'string' && ['hook_progress', 'hook_response'].includes(e.subtype))
    .map(textOfReviewEvent).join('')
  return extractTag(concatenated, REMOTE_REVIEW_TAG)
}
export function formatRemoteReviewFindings(text: string): string {
  let parsed
  try { parsed = JSON.parse(text) } catch { return text }
  if (!Array.isArray(parsed)) return text
  if (!parsed.length) return 'Review complete — no findings.'
  const out = ['Review complete — ' + parsed.length + ' ' + (parsed.length === 1 ? 'finding' : 'findings'), '']
  for (const result of parsed) {
    if (!isRecord(result)) continue
    const severity = typeof result.severity === 'string' ? result.severity : 'normal'
    const file = typeof result.file_path === 'string' ? result.file_path : '?'
    const start = typeof result.start_line === 'number' ? result.start_line : 0
    const end = typeof result.end_line === 'number' ? result.end_line : start
    out.push((severitySymbol[severity] ?? severitySymbol.normal) +
      ' ' + file + ':' + (start === end ? start : start + '-' + end))
    const comment = typeof result.pr_comment === 'string' ? result.pr_comment.trim() : ''
    if (comment) out.push(comment)
    out.push('')
  }
  return out.join('\n').trimEnd()
}
