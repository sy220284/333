/**
 * Owns a task's next polling timer. Stopping a task must cancel the pending
 * timer and prevent responses to in-flight requests from scheduling again.
 * Timer methods are injectable for deterministic lifecycle tests.
 */
export function createPollingLifecycle(timers = {
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: handle => clearTimeout(handle),
}) {
  let active = true
  let pending
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
