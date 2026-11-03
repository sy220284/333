/**
 * Claude Code 2.1.310 spinner timing and status state machine.
 * Source evidence: chunk-0grh2x0w.js and chunk-jfdswx4x.js (Ve/He/Hn/Kn).
 * Keep these transitions pure so terminal tests can use a deterministic clock.
 */
export const SPINNER_CYCLE_MS = 2000
export const SPINNER_STALL_AFTER_MS = 10000
export const SPINNER_STALL_FADE_MS = 10000
export const SPINNER_METRICS_AFTER_MS = 16000
export const SPINNER_TOOL_STATUS_AFTER_MS = 2000

export type SpinnerStatusTracker = {
  toolWindowStart: number | null
  toolWindowEnd: number | null
  thinkingBurstStart: number | null
  wasThinking: boolean
}

export type OutputLimitRecovery = { attempt: number; limit: number }

export type SpinnerStatus =
  | { kind: 'tool-running'; toolMs: number }
  | { kind: 'tool-done'; toolMs: number }
  | { kind: 'recovering'; recovery: OutputLimitRecovery }
  | { kind: 'thinking'; thinkingMs: number }
  | { kind: 'thought-for'; thoughtMs: number }
  | { kind: 'none' }

export type SpinnerStatusInput = {
  now: number
  isThinking: boolean
  hasActiveTools: boolean
  thinkingStatus: 'thinking' | number | null
  showToolCallTimer: boolean
  outputLimitRecovery: OutputLimitRecovery | null
}

/** New turn/agent should begin with a fresh tracker. */
export function createSpinnerStatusTracker(): SpinnerStatusTracker {
  return { toolWindowStart: null, toolWindowEnd: null, thinkingBurstStart: null, wasThinking: false }
}

export function advanceSpinnerStatusTracker(
  previous: SpinnerStatusTracker,
  input: Pick<SpinnerStatusInput, 'now' | 'isThinking' | 'hasActiveTools' | 'thinkingStatus'>,
): SpinnerStatusTracker {
  let { toolWindowStart, toolWindowEnd, thinkingBurstStart } = previous
  if (input.hasActiveTools) {
    if (toolWindowStart === null || toolWindowEnd !== null) toolWindowStart = input.now
    toolWindowEnd = null
  } else if (toolWindowStart !== null && toolWindowEnd === null) {
    toolWindowEnd = input.now
  }
  if (!input.hasActiveTools && input.thinkingStatus !== null) {
    toolWindowStart = null
    toolWindowEnd = null
  }
  if (input.isThinking) {
    if (!previous.wasThinking) thinkingBurstStart = input.now
  } else {
    thinkingBurstStart = null
  }
  return { toolWindowStart, toolWindowEnd, thinkingBurstStart, wasThinking: input.isThinking }
}

export function deriveSpinnerStatus(
  tracker: SpinnerStatusTracker,
  input: SpinnerStatusInput,
): SpinnerStatus {
  if (input.showToolCallTimer && input.hasActiveTools && tracker.toolWindowStart !== null) {
    const toolMs = input.now - tracker.toolWindowStart
    if (toolMs >= SPINNER_TOOL_STATUS_AFTER_MS) return { kind: 'tool-running', toolMs }
  }
  if (input.outputLimitRecovery !== null && !input.hasActiveTools)
    return { kind: 'recovering', recovery: input.outputLimitRecovery }
  if (input.showToolCallTimer && !input.hasActiveTools && input.thinkingStatus === null &&
      tracker.toolWindowStart !== null && tracker.toolWindowEnd !== null) {
    const toolMs = tracker.toolWindowEnd - tracker.toolWindowStart
    if (toolMs >= SPINNER_TOOL_STATUS_AFTER_MS) return { kind: 'tool-done', toolMs }
  }
  if (input.thinkingStatus === 'thinking' && !input.hasActiveTools)
    return { kind: 'thinking', thinkingMs: tracker.thinkingBurstStart === null
      ? 0 : input.now - tracker.thinkingBurstStart }
  if (typeof input.thinkingStatus === 'number')
    return { kind: 'thought-for', thoughtMs: input.thinkingStatus }
  return { kind: 'none' }
}

/** One smooth rise/fall per 2 seconds; matched to the six target glyph phases. */
export function getSpinnerFrame(timeMs: number, phaseCount: number): number {
  return Math.round((1 - Math.cos(2 * Math.PI * timeMs / SPINNER_CYCLE_MS)) / 2 * (phaseCount - 1))
}

export function getProgressiveThinkingLabel(ms: number): string {
  if (ms >= 45000) return 'deep in thought'
  if (ms >= 30000) return 'thinking some more'
  if (ms >= 20000) return 'thinking more'
  if (ms >= 10000) return 'still thinking'
  return 'thinking'
}

export function describeSpinnerStatus(
  status: SpinnerStatus,
  effortSuffix: string,
  formatDuration: (milliseconds: number) => string,
): string | null {
  switch (status.kind) {
    case 'tool-running': return `running tool for ${formatDuration(status.toolMs)}`
    case 'tool-done': return `ran tool for ${formatDuration(status.toolMs)}`
    case 'recovering': return status.recovery.attempt > 1
      ? `picking the thought back up (${status.recovery.attempt} of ${status.recovery.limit})`
      : 'picking the thought back up'
    case 'thinking': return getProgressiveThinkingLabel(status.thinkingMs) + effortSuffix
    case 'thought-for': return `thought for ${Math.max(1, Math.round(status.thoughtMs / 1000))}s`
    case 'none': return null
  }
}

/** Rendering contract for the real API retry, stall and policy wait stages. */
export type SpinnerRetryStatus = {
  kind: 'retrying' | 'stalled' | 'low_priority_waiting' | 'auto_mode_unavailable'
  deadline: number
  attempt: number
  maxRetries: number
  reason?: string
}

export function getRetryCountdownMs(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000)) * 1000
}

export function describeRetryStatus(
  status: SpinnerRetryStatus,
  now: number,
  formatDuration: (milliseconds: number) => string,
): string {
  const remaining = formatDuration(getRetryCountdownMs(status.deadline, now))
  switch (status.kind) {
    case 'stalled':
      return `Waiting for API response · will retry in ${remaining} · check your network`
    case 'low_priority_waiting':
      return `${status.reason ?? 'Waiting for available capacity'} · next try in ${remaining} · attempt ${status.attempt} · esc to interrupt`
    case 'auto_mode_unavailable':
      return `Auto mode check unavailable · next try in ${remaining} · attempt ${status.attempt}/${status.maxRetries} · esc to interrupt`
    case 'retrying':
      return `${status.reason ?? 'Request failed'} · Retrying in ${remaining} · attempt ${status.attempt}/${status.maxRetries}`
  }
}
