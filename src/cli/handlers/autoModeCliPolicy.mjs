/** Official 2.1.317 case-insensitive rule-title-prefix matching. */
export function filterAutoModeRulesByLabel(rules, prefix) {
  const title = value => {
    const cleaned = value.replace(/\*/g, '').replace(/\[[^\]]*\]/g, '').toLowerCase()
    const end = cleaned.search(/[:\[]/)
    return (end < 0 ? cleaned : cleaned.slice(0, end)).trimEnd()
  }
  const expected = title(prefix) || prefix.toLowerCase()
  const matches = rule => title(rule).startsWith(expected)
  return {
    allow: rules.allow.filter(matches),
    soft_deny: rules.soft_deny.filter(matches),
    hard_deny: rules.hard_deny.filter(matches),
    environment: rules.environment.filter(matches),
  }
}
