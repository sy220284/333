export type ReviewMode = 'normal' | 'deep' | 'security'

/** 一个审查入口，仅使用本地 Git/文件工具。 */
export function parseReviewRequest(args: string): { mode: ReviewMode; target: string } {
  const value = args.trim()
  const match = /^(?:(?:--mode[ =])?)(normal|deep|security|普通|深度|安全)(?=\s|$)/i.exec(value)
  if (!match) return { mode: 'normal', target: value }
  const token = (match[1] ?? '').toLowerCase()
  const mode: ReviewMode = token === 'deep' || token === '深度'
    ? 'deep'
    : token === 'security' || token === '安全'
      ? 'security'
      : 'normal'
  return { mode, target: value.slice(match[0].length).trim() }
}

