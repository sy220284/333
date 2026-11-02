/** Source-level contracts observed in the official 2.1.310 Linux x64 CLI. */
const blockedExecutionTools = Object.freeze(['Bash', 'PowerShell', 'WebFetch'])

/** --restricted blocks execution tools unless the user explicitly names them. */
export function restrictedToolDenyList(baseTools = [], disallowedTools = []) {
  const requested = new Set(
    baseTools.flatMap(value => String(value).split(/[\s,]+/)).filter(Boolean),
  )
  // 'default' is a preset, not an explicit authorization for code execution.
  return [...new Set([
    ...disallowedTools,
    ...blockedExecutionTools.filter(tool => !requested.has(tool)),
  ])]
}

/** Explicit --prompt-suggestions values follow the native CLI's boolean vocabulary. */
export function parsePromptSuggestions(value) {
  if (value === undefined) return undefined
  if (value === true) return true
  if (value === false) return false
  const str = String(value).toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(str)) return true
  if (['false', '0', 'no', 'off'].includes(str)) return false
  throw new Error('Allowed choices are true, false, 1, 0, yes, no, on, off.')
}

/** A host cannot be asked when --permission-prompts none is selected. */
export function denyUnansweredPrompt(decision) {
  if (decision.behavior !== 'ask') return decision
  return {
    behavior: 'deny',
    message: decision.message || 'Permission denied: prompting disabled (--permission-prompts none)',
    decisionReason: decision.decisionReason ?? { type: 'mode', mode: 'dontAsk' },
  }
}
