/**
 * Parse the 2.1.310 comma-separated --fallback-model chain.
 * Keep custom provider model identifiers intact; reject invalid or ambiguous hops.
 */
export function parseFallbackModels(value: unknown, primaryModel?: string): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'string') {
    throw new TypeError('Fallback models must be a comma-separated string');
  }
  // Verified against the official 2.1.310 Linux x64 CLI with a 529 mock API:
  // empty comma segments and repeated model IDs are skipped, retaining order.
  // The primary may appear in the input, but is not retried as its own fallback.
  const models = value.split(',').map(model => model.trim()).filter(Boolean);
  const seen = new Set<string>();
  return models.filter(model => {
    if (model === primaryModel || seen.has(model)) return false;
    seen.add(model);
    return true;
  });
}

/** One chain per query; failed models can never be revisited in a fallback loop. */
export function createFallbackModelChain(value: unknown) : { next(currentModel: string): string | undefined; advance(currentModel: string): string | undefined; } {
  const models = parseFallbackModels(value);
  const tried = new Set<string>();
  return {
    next(currentModel: string): string | undefined {
      return models.find(model => model !== currentModel && !tried.has(model));
    },
    advance(currentModel: string): string | undefined {
      tried.add(currentModel);
      const model = models.find(candidate => candidate !== currentModel && !tried.has(candidate));
      if (model !== undefined) tried.add(model);
      return model;
    },
  };
}
