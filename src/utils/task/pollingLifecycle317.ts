/**
 * Owns a task's next polling timer. Stopping a task must cancel the pending
 * timer and prevent responses to in-flight requests from scheduling again.
 * Timer methods are injectable for deterministic lifecycle tests.
 */
export type PollingTimers317<Handle> = {
  schedule(callback: () => void, delay: number): Handle
  cancel(handle: Handle): void
}
export type PollingLifecycle317 = {
  readonly active: boolean
  schedule(callback: () => void | Promise<void>, delay: number): void
  stop(): void
}
export function createPollingLifecycle<Handle = ReturnType<typeof setTimeout>>(
  timers: PollingTimers317<Handle> = {
    schedule: (callback: () => void, delay: number) => setTimeout(callback, delay) as Handle,
    cancel: (handle: Handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): PollingLifecycle317 {
  let active = true
  let pending: Handle | undefined
  return {
    get active() { return active },
    schedule(callback, delay) {
      if (!active) return
      if (pending !== undefined) timers.cancel(pending)
      pending = timers.schedule(() => {
        pending = undefined
        if (active) void callback()
      }, delay)
    },
    stop() {
      if (!active) return
      active = false
      if (pending !== undefined) {
        timers.cancel(pending)
        pending = undefined
      }
    },
  }
}
