/**
 * 2.1.317 plugin test VM timer ownership.
 * Timers belong to a file's sandbox: callbacks cannot outlive it.
 * Rejected/throwing async timer callbacks are reported as test failures.
 */
export function createPluginTestTimers317() {
  let nextId = 0
  let disposed = false
  const live = new Map()
  const failures = []
  const schedule = (repeated, fn, delay, ...args) => {
    if (disposed) throw new Error('plugin test environment was unloaded')
    if (typeof fn !== 'function') throw new TypeError('a timer takes a function')
    const ms = Number.isFinite(delay) && Number(delay) > 0 ? Math.min(Number(delay), 2147483647) : 0
    const id = ++nextId
    const invoke = async () => {
      if (!repeated) live.delete(id)
      if (disposed) return
      try { await fn(...args) }
      catch (error) { failures.push(error instanceof Error ? error : new Error(String(error))) }
    }
    const timer = repeated ? setInterval(invoke, ms) : setTimeout(invoke, ms)
    live.set(id, timer)
    return id
  }
  const cancel = id => {
    const timer = live.get(id)
    if (timer !== undefined) { clearTimeout(timer); live.delete(id) }
  }
  return {
    setTimeout: (fn, delay, ...args) => schedule(false, fn, delay, ...args),
    setInterval: (fn, delay, ...args) => schedule(true, fn, delay, ...args),
    clearTimeout: cancel,
    clearInterval: cancel,
    get failures() { return failures.slice() },
    dispose() {
      if (disposed) return
      disposed = true
      for (const timer of live.values()) clearTimeout(timer)
      live.clear()
    },
  }
}
