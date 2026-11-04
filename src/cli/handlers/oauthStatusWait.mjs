/**
 * Auth status exit barrier: wait for the actual refresh promise instead of
 * sleeping for a fixed duration. The 317 startup wait budget is 8.5 seconds.
 */
export async function settleOAuthRefreshOnExit(refresh, timeoutMs = 8500) {
  if (timeoutMs < 0 || !Number.isFinite(timeoutMs)) {
    throw new RangeError('OAuth refresh exit timeout must be nonnegative and finite')
  }
  let timeout
  try {
    return await Promise.race([
      Promise.resolve(refresh).then(() => true, () => true),
      new Promise(resolve => { timeout = setTimeout(() => resolve(false), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}
