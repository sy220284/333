/**
 * Parse the 2.1.310 comma-separated --fallback-model chain.
 * Keep custom provider model identifiers intact; reject invalid or ambiguous hops.
 */
export function parseFallbackModels(value, primaryModel) {
  if (value === undefined || value === null) return [];
  if (typeof value !== 'string') {
    throw new TypeError('Fallback models must be a comma-separated string');
  }
  const models = value.split(',').map(model => model.trim());
  const visited = new Set();
  for (const model of models) {
    if (!model || /\s|\0/.test(model) || model.startsWith('-') || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(model)) {
      throw new Error(`Invalid fallback model: ${JSON.stringify(model)}`);
    }
    if (model === primaryModel) {
      throw new Error(`Fallback model cannot be the same as the primary model: ${model}`);
    }
    if (visited.has(model)) {
      throw new Error(`Duplicate fallback model: ${model}`);
    }
    visited.add(model);
  }
  return models;
}

/** One chain per query; failed models can never be revisited in a fallback loop. */
export function createFallbackModelChain(value) {
  const models = parseFallbackModels(value);
  const tried = new Set();
  return {
    next(currentModel) {
      return models.find(model => model !== currentModel && !tried.has(model));
    },
    advance(currentModel) {
      tried.add(currentModel);
      const model = models.find(candidate => candidate !== currentModel && !tried.has(candidate));
      if (model !== undefined) tried.add(model);
      return model;
    },
  };
}
