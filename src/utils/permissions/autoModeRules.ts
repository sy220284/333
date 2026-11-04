export type AutoModeRuleSet = {
  allow?: string[]; soft_deny?: string[]; hard_deny?: string[]; deny?: string[]; environment?: string[]
}
export type AutoModeRuleSource = 'userSettings' | 'flagSettings' | 'policySettings'

export function expandAutoModeRules(rules: readonly string[] | undefined, defaults: readonly string[]): string[] {
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

export function renderAutoModeRuleBlock(rules: readonly string[] | undefined, originalBlock: string, builtins: readonly string[] = []): string {
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
export function parseTaggedAutoModeBullets(template: string, tagName: string): string[] {
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

/** Preserve the 2.1.317 source precedence for classifier rules. */
export function mergeAutoModeRulesBySource(sources: Partial<Record<AutoModeRuleSource, AutoModeRuleSet>>, managedAllowLocked = false): AutoModeRuleSet | undefined {
  const allowBySource: Partial<Record<AutoModeRuleSource, string[]>> = {}
  const soft_deny = []
  const hard_deny = []
  const environment = []
  for (const source of ['userSettings', 'flagSettings', 'policySettings'] as const) {
    const config = sources[source]
    if (!config) continue
    if (config.allow) allowBySource[source] = config.allow
    if (config.soft_deny) soft_deny.push(...config.soft_deny)
    if (config.deny) soft_deny.push(...config.deny)
    if (config.hard_deny) hard_deny.push(...config.hard_deny)
    if (config.environment) environment.push(...config.environment)
  }
  const policyAllow = allowBySource.policySettings
  let flagAllow = allowBySource.flagSettings ?? []
  if (
    flagAllow.includes('$defaults') &&
    ((policyAllow?.length > 0 && !policyAllow.includes('$defaults')) || managedAllowLocked)
  ) flagAllow = flagAllow.filter(rule => rule !== '$defaults')
  const allow = [...(allowBySource.userSettings ?? []), ...flagAllow, ...(policyAllow ?? [])]
  if (!allow.length && !soft_deny.length && !hard_deny.length && !environment.length) return undefined
  return {
    ...(allow.length ? { allow } : {}),
    ...(soft_deny.length ? { soft_deny } : {}),
    ...(hard_deny.length ? { hard_deny } : {}),
    ...(environment.length ? { environment } : {}),
  }
}
