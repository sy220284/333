/** Types for the 2.1.310 spinner tip eligibility engine. */
export type SpinnerTipCandidate = {
  id: string
  cooldownSessions: number
  priority?: number
  maxLifetimeShows?: number
  advertisedCommand?: string
  providerAgnostic?: boolean
  isRelevant: () => boolean | Promise<boolean>
}

export type SpinnerTipEligibilitySources = {
  isFirstPartyBackend: boolean
  isCommandOffered: (name: string) => Promise<boolean>
  sessionsSinceShown: (id: string) => number
  lifetimeShown: (id: string) => number
  hasFailed: (id: string) => boolean
  markFailed: (id: string) => void
  report: (error: unknown, kind: string) => void
}

export declare function selectEligibleTips<T extends SpinnerTipCandidate>(
  candidates: T[],
  sources: SpinnerTipEligibilitySources,
): Promise<T[]>

export declare function selectLongestUnshown<T extends SpinnerTipCandidate>(
  availableTips: T[],
  sessionsSinceShown: (id: string) => number,
): T | undefined
