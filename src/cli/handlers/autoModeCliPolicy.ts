/** Official 2.1.317 case-insensitive rule-title-prefix matching. */
export type AutoModeLabelRules = { allow: string[]; soft_deny: string[]; hard_deny: string[]; environment: string[] }

export function filterAutoModeRulesByLabel(rules: AutoModeLabelRules, prefix: string): AutoModeLabelRules {
  const title = (value: string): string => {
    const cleaned = value.replace(/\*/g, '').replace(/\[[^\]]*\]/g, '').toLowerCase()
    const end = cleaned.search(/[:\[]/)
    return (end < 0 ? cleaned : cleaned.slice(0, end)).trimEnd()
  }
  const expected = title(prefix) || prefix.toLowerCase()
  const matches = (rule: string): boolean => title(rule).startsWith(expected)
  return {
    allow: rules.allow.filter(matches),
    soft_deny: rules.soft_deny.filter(matches),
    hard_deny: rules.hard_deny.filter(matches),
    environment: rules.environment.filter(matches),
  }
}

/** A reset removes user-level autoMode only, without rewriting other values. */
export function removeAutoModeSection(settings: Record<string, unknown>): Record<string, unknown> | null {
  if (!Object.hasOwn(settings, 'autoMode')) return null
  const next = { ...settings }
  delete next.autoMode
  return next
}
