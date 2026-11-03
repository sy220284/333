/**
 * Match regional, [1m], dated and undated spellings of the configured
 * default model while keeping distinct generations separate.
 * The canonicalizer is supplied by the existing provider/model resolver.
 */
export function matchesDefaultModelVariant(model, defaultModel, canonicalize) {
  if (model === defaultModel) return true
  const expected = canonicalize(defaultModel)
  if (!/^claude-(?:opus|sonnet)-\\d+(?:-\\d+)+$/.test(expected)) return false

  // The existing provider canonicalizer recognizes some families via a
  // substring search. Guard the full token boundary first so "4-60" cannot
  // accidentally be treated as "4-6" when checking cache policy.
  const candidate = model.toLowerCase()
  const token = expected.toLowerCase()
  const index = candidate.indexOf(token)
  if (index < 0) return false
  const before = index === 0 ? '' : candidate[index - 1]
  const after = candidate[index + token.length] ?? ''
  if (before && !/[.\\/@]/.test(before)) return false
  if (/\\d/.test(after)) return false
  return canonicalize(model) === expected
}
