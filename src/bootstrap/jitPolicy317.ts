/**
 * Claude Code 2.1.317 process startup's delayed JIT tuning (official
 * cli.js, chunk-zndmhcz5.js). Keep this independent of main.tsx imports:
 * a version/help invocation must never wait for the ten-second timer.
 */
export const JIT_POLICY_DELAY_MS = 10_000

/** Only 1..100 are accepted by the 2.1.317 env integer descriptor. */
export function jitPolicyFromEnv317(value: string|undefined) : number {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 1
}

export function scheduleJitPolicy317({
  args = process.argv.slice(2),
  env = process.env,
  bun = typeof Bun === 'undefined' ? undefined : Bun,
  schedule = setTimeout,
} = {}) : boolean {
  // These specialist worker starts intentionally skip the ordinary process
  // lifecycle scheduling, matching the official 317 entrypoint.
  if (args[0] === '--preload' || args[0] === '--bg-spare') return false
  const timer = schedule(() => {
    const policy = jitPolicyFromEnv317(env.CLAUDE_CODE_JIT_POLICY_AFTER_STARTUP)
    if (typeof bun?.unsafe?.setJITPolicy === 'function') {
      bun.unsafe.setJITPolicy(policy)
    }
  }, JIT_POLICY_DELAY_MS)
  timer.unref()
  return true
}
