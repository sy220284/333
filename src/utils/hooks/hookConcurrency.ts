/** Session-scoped scheduling for prompt/agent hooks (2.1.312).
 * Up to 24 concurrent hooks. Twelve additional hooks may start only after
 * waiting at least the event timeout (minimum one second).
 */
type HookPermit317 = () => void
type HookLane317 = 'active' | 'overdue'
type HookWaiter317 = {
  expired: boolean
  timer: ReturnType<typeof setTimeout> | undefined
  signal: AbortSignal | undefined
  onAbort: (() => void) | undefined
  resolve: (release: HookPermit317) => void
}
type HookState317 = { active: number; overdue: number; queue: HookWaiter317[] }
const states = new Map<string, HookState317>()
const MAX_ACTIVE = 24
const MAX_OVERDUE = 12

function getState(key: string): HookState317 {
  let state = states.get(key)
  if (!state) {
    state = {active: 0, overdue: 0, queue: []}
    states.set(key, state)
  }
  return state
}

function drain(key: string, state: HookState317): void {
  while (state.queue.length && state.active < MAX_ACTIVE) {
    const waiter = state.queue.shift()
    if (!waiter) break
    grant(key, state, waiter, 'active')
  }
  // Overdue eligibility belongs to each hook, not the oldest queued event.
  // A long-timeout waiter at the front must not block a later hook whose
  // shorter timeout has already elapsed.
  while (state.queue.length && state.overdue < MAX_OVERDUE) {
    const index = state.queue.findIndex(waiter => waiter.expired)
    if (index < 0) break
    const [waiter] = state.queue.splice(index, 1)
    if (!waiter) break
    grant(key, state, waiter, 'overdue')
  }
  if (!state.queue.length && state.active === 0 && state.overdue === 0) states.delete(key)
}

function grant(key: string, state: HookState317, waiter: HookWaiter317, lane: HookLane317): void {
  clearTimeout(waiter.timer)
  if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort)
  if (lane === 'active') state.active++
  else state.overdue++
  let released = false
  waiter.resolve(() => {
    if (released) return
    released = true
    if (lane === 'active') state.active--
    else state.overdue--
    drain(key, state)
  })
}

export function acquireHookPermit(sessionId: string | undefined | null, timeoutMs: number, signal?: AbortSignal): Promise<HookPermit317> {
  if (signal?.aborted) return Promise.resolve(() => {})
  const key = sessionId || 'local-session'
  const state = getState(key)
  return new Promise<HookPermit317>(resolve => {
    const waiter: HookWaiter317 = {
      expired: false,
      timer: undefined,
      signal,
      onAbort: undefined,
      resolve,
    }
    waiter.onAbort = () => {
      const index = state.queue.indexOf(waiter)
      if (index < 0) return
      state.queue.splice(index, 1)
      clearTimeout(waiter.timer)
      if (waiter.onAbort) signal?.removeEventListener('abort', waiter.onAbort)
      resolve(() => {})
      drain(key, state)
    }
    state.queue.push(waiter)
    if (waiter.onAbort) signal?.addEventListener('abort', waiter.onAbort, {once: true})
    // An explicit timeout of 0.1s still counts as 1 second.
    const waitingMs = Math.max(1000, Number.isFinite(timeoutMs) ? timeoutMs : 1000)
    waiter.timer = setTimeout(() => {
      waiter.expired = true
      drain(key, state)
    }, waitingMs)
    drain(key, state)
  })
}

export async function* limitHookGenerator<T>(
  generator: AsyncIterable<T> | Iterable<T>,
  sessionId: string | undefined | null,
  timeoutMs: number,
  signal?: AbortSignal,
): AsyncGenerator<T, void, unknown> {
  const release = await acquireHookPermit(sessionId, timeoutMs, signal)
  try {
    if (signal?.aborted) return
    yield* generator
  } finally {
    release()
  }
}
