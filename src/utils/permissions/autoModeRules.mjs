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

/** Keep indented bullet continuations inside their parent rule. */
export function parseTaggedAutoModeBullets(template, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = template.match(new RegExp(`<${escaped}>([\\s\\S]*?)<\\/${escaped}>`))
  if (!match) return []
  const rules = []
  for (const line of (match[1] ?? '').split('\n')) {
    if (line.startsWith('- ')) {
      rules.push(line.slice(2))
    } else if (rules.length > 0) {
      rules[rules.length - 1] += '\n' + line
    }
  }
  return rules
}
