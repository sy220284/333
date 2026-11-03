/**
 * Session-local proactive mode lifecycle.
 *
 * The REPL, headless transport, system-prompt selector and tool pool all
 * observe the same state.  Pausing input and blocking on context overflow
 * are independent reasons to withhold idle ticks; clearing one must not
 * accidentally resume the other.
 */
export type ProactiveActivationSource = 'command'

type ProactiveState = {
  active: boolean
  pausedByUser: boolean
  contextBlocked: boolean
  activationSource: ProactiveActivationSource | null
}

const state: ProactiveState = {
  active: false,
  pausedByUser: false,
  contextBlocked: false,
  activationSource: null,
}

const listeners = new Set<() => void>()

function notifyIfChanged(previous: string): void {
  if (previous === snapshot()) return
  for (const listener of [...listeners]) listener()
}

function snapshot(): string {
  return [state.active, state.pausedByUser, state.contextBlocked, state.activationSource].join('|')
}

/** Active stays true while paused so the tool pool and system prompt stay stable. */
export function isProactiveActive(): boolean {
  return state.active
}

/** Both a user interruption and an API context error suppress idle ticks. */
export function isProactivePaused(): boolean {
  return state.active && (state.pausedByUser || state.contextBlocked)
}

export function getProactiveActivationSource(): ProactiveActivationSource | null {
  return state.activationSource
}

export function activateProactive(source: ProactiveActivationSource): void {
  const previous = snapshot()
  state.active = true
  state.pausedByUser = false
  state.contextBlocked = false
  state.activationSource = source
  notifyIfChanged(previous)
}

export function deactivateProactive(): void {
  const previous = snapshot()
  state.active = false
  state.pausedByUser = false
  state.contextBlocked = false
  state.activationSource = null
  notifyIfChanged(previous)
}

export function pauseProactive(): void {
  if (!state.active) return
  const previous = snapshot()
  state.pausedByUser = true
  notifyIfChanged(previous)
}

export function resumeProactive(): void {
  if (!state.active) return
  const previous = snapshot()
  state.pausedByUser = false
  notifyIfChanged(previous)
}

/** A successful compact or successful model response clears this block. */
export function setContextBlocked(blocked: boolean): void {
  if (!state.active) return
  const previous = snapshot()
  state.contextBlocked = blocked
  notifyIfChanged(previous)
}

/** Compatible with React.useSyncExternalStore; unsubscribe is identity-safe. */
export function subscribeToProactiveChanges(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
