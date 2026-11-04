export function expandAutoModeRules(rules, defaults) {
  if (!rules?.length) return [...defaults]
  const expanded = []
  let inserted = false
  for (const rule of rules) {
    if (rule === '$defaults') {
      if (!inserted) { expanded.push(...defaults); inserted = true }
    } else { expanded.push(rule) }
  }
  return expanded
}

export function renderAutoModeRuleBlock(rules, originalBlock, builtins = []) {
  const defaults = [...builtins.map(rule => `- ${rule}`), originalBlock].filter(Boolean).join('\n')
  if (!rules?.length) return defaults
  const parts = []
  let inserted = false
  for (const rule of rules) {
    if (rule === '$defaults') {
      if (!inserted) { if (defaults) parts.push(defaults); inserted = true }
    } else { parts.push(`- ${rule}`) }
  }
  return parts.join('\n')
}
