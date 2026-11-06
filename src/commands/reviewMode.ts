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

/** 仅在用户明确指定 cross/交叉 时启用第二模型审查。 */
export function parseCrossReviewSpec(args: string): { reviewer: string; request: string } | null {
  const text = args.trim()
  const prefix = /^(?:cross|交叉)(?=\s|$)/i.exec(text)
  if (!prefix) return null
  const rest = text.slice(prefix[0].length).trim()
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(rest)
  if (!match) throw new Error('交叉复核需要指定模型：/review cross opus deep 19，或 /review cross provider/model security 19')
  const reviewer = match[1]!
  if (!/^(?:opus|sonnet|haiku|[^/\s]+\/[^\s]+)$/i.test(reviewer)) {
    throw new Error('复核模型须为 opus、sonnet、haiku 或配置过的 provider/model')
  }
  return { reviewer, request: match[2] ?? '' }
}
