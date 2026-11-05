/**
 * Match regional, [1m], dated and undated spellings of the configured
 * default model while keeping distinct generations separate.
 * The canonicalizer is supplied by the existing provider/model resolver.
 */
export function matchesDefaultModelVariant(
  model: string,
  defaultModel: string,
  canonicalize: (model: string) => string,
): boolean {
  if (model === defaultModel) return true
  const expected = canonicalize(defaultModel)
  if (!/^claude-(?:opus|sonnet)-[0-9]+(?:-[0-9]+)+$/.test(expected)) return false

  // Guard the full token boundary first: the existing provider canonicalizer
  // can recognize a model using a loose substring search.
  const candidate = model.toLowerCase()
  const token = expected.toLowerCase()
  const index = candidate.indexOf(token)
  if (index < 0) return false
  const before = index === 0 ? '' : candidate[index - 1]
  const after = candidate[index + token.length] ?? ''
  if (before && before !== '.' && before !== '/' && before !== '@') return false
  if (after >= '0' && after <= '9') return false
  return canonicalize(model) === expected
}
