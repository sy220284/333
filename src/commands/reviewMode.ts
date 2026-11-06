export type ReviewMode = 'normal' | 'deep' | 'security'

export function parseReviewRequest(args: string): { mode: ReviewMode; target: string } {
  const value = args.trim()
  if (/^(?:--mode[ =])?(?:extreme|极深)(?=\s|$)/i.test(value)) {
    throw new Error('极深审查已移除，请选择普通、深度或安全审查')
  }
  const match = /^(?:(?:--mode[ =])?)(normal|deep|security|普通|深度|安全)(?=\s|$)/i.exec(value)
  if (!match) return { mode:'normal', target:value }
  const name = (match[1] ?? '').toLowerCase()
  const mode: ReviewMode = name === 'deep' || name === '深度' ? 'deep'
    : name === 'security' || name === '安全' ? 'security'
      : 'normal'
  return { mode, target:value.slice(match[0].length).trim() }
}
