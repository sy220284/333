export type ReviewMode = 'normal' | 'deep' | 'security' | 'extreme'

export function parseReviewRequest(args: string): { mode: ReviewMode; target: string } {
  const value = args.trim()
  const match = /^(?:(?:--mode[ =])?)(normal|deep|security|extreme|普通|深度|安全|极深)(?=\s|$)/i.exec(value)
  if (!match) return { mode:'normal', target:value }
  const name = (match[1] ?? '').toLowerCase()
  const mode: ReviewMode = name === 'deep' || name === '深度' ? 'deep'
    : name === 'security' || name === '安全' ? 'security'
      : name === 'extreme' || name === '极深' ? 'extreme' : 'normal'
  return { mode, target:value.slice(match[0].length).trim() }
}
