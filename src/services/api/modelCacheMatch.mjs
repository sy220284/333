/**
 * Match regional, [1m], dated and undated spellings of the configured
 * default model while keeping distinct generations separate.
 * The canonicalizer is supplied by the existing provider/model resolver.
 */
export function matchesDefaultModelVariant(model, defaultModel, canonicalize) {
  if (model === defaultModel) return true
  const expected = canonicalize(defaultModel)
  return /^claude-(?:opus|sonnet)-/.test(expected) &&
    canonicalize(model) === expected
}
