/**
 * Pure remote-review wire format shared by the CLI poller and its tests.
 * SDK hook progress/response events and assistant text must have the same
 * extraction semantics as the RemoteAgentTask completion path.
 */
export const REMOTE_REVIEW_TAG = 'remote-review'
export const REMOTE_REVIEW_PROGRESS_TAG = 'remote-review-progress'
const severitySymbol = {
  normal: '🔴',
  nit: '🟡',
  pre_existing: '🟣',
}
export function extractTag(text, tag) {
  const startTag = '<' + tag + '>'
  const endTag = '</' + tag + '>'
  const end = text.lastIndexOf(endTag)
  if (end < 0) return undefined
  const start = text.lastIndexOf(startTag, end)
  return start >= 0 ? text.slice(start + startTag.length, end).trim() : undefined
}
export function textOfReviewEvent(event) {
  if (!event || typeof event !== 'object') return ''
  if ((event.subtype === 'hook_response' || event.subtype === 'hook_progress') &&
    typeof event.stdout === 'string') return event.stdout
  if (event.type !== 'assistant') return ''
  const content = event.message?.content
  return Array.isArray(content)
    ? content.filter(part => part?.type === 'text').map(part => part.text ?? '').join('\n')
    : ''
}
export function extractLatestRemoteReview(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const result = extractTag(textOfReviewEvent(events[i]), REMOTE_REVIEW_TAG)
    if (result) return result
  }
  // A hook can flush across two distinct events when stdout is large.
  const concatenated = events
    .filter(e => e?.type === 'system' && ['hook_progress', 'hook_response'].includes(e?.subtype))
    .map(textOfReviewEvent).join('')
  return extractTag(concatenated, REMOTE_REVIEW_TAG)
}
export function formatRemoteReviewFindings(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { return text }
  if (!Array.isArray(parsed)) return text
  if (!parsed.length) return 'Review complete — no findings.'
  const out = ['Review complete — ' + parsed.length + ' ' + (parsed.length === 1 ? 'finding' : 'findings'), '']
  for (const result of parsed) {
    if (!result || typeof result !== 'object') continue
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
