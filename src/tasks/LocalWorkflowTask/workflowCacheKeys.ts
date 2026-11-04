import { createHash } from 'node:crypto'

/** Stable across insertions of unrelated agent calls; distinct for repeated
 * identical prompts/options within one deterministic workflow traversal.
 */
export function makeWorkflowCacheKey(prompt, options, ordinal) {
  if (typeof prompt !== 'string' || typeof ordinal !== 'number' ||
      !Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error('Invalid workflow cache invocation')
  }
  const signature = JSON.stringify([prompt, options ?? {}])
  return createHash('sha256').update(signature).update('\0').update(String(ordinal)).digest('hex')
}
export function createWorkflowCallCounter() {
  const seen = new Map()
  return (prompt, options) => {
    const signature = JSON.stringify([prompt, options ?? {}])
    const ordinal = seen.get(signature) ?? 0
    seen.set(signature, ordinal + 1)
    return makeWorkflowCacheKey(prompt, options, ordinal)
  }
}
