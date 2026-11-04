import type { Tip } from './types.js'
import type { ThemeName } from '../../utils/theme.js'

export type SpinnerTipEligibility317 = {
  isFirstPartyBackend: boolean
  isCommandOffered: (command: string) => boolean | Promise<boolean>
  sessionsSinceShown: (id: string) => number
  lifetimeShown: (id: string) => number
  hasFailed: (id: string) => boolean
  markFailed: (id: string) => void
  report: (error: unknown, cause: string) => void
}
export type SpinnerTipFailureHandler317 = Pick<SpinnerTipEligibility317, 'markFailed' | 'report'>

/**
 * Spinner-tip eligibility in 2.1.310.
 *
 * Source: chunk-akrpc6v9.js:155-175 in the pinned Linux x64 decompile.
 * Dependencies are supplied by the caller so eligibility never depends on UI state
 * and can be tested with actual command and provider policies.
 */
export async function selectEligibleTips(candidates: Tip[], {
  isFirstPartyBackend, isCommandOffered, sessionsSinceShown, lifetimeShown,
  hasFailed, markFailed, report,
}: SpinnerTipEligibility317): Promise<Tip[]> {
  const selected = await Promise.all(candidates.map(async tip => {
    if (hasFailed(tip.id)) return false
    if (!isFirstPartyBackend && tip.providerAgnostic !== true) return false
    if (tip.advertisedCommand !== undefined) {
      try {
        if (!await isCommandOffered(tip.advertisedCommand)) return false
      } catch (error) {
        markFailed(tip.id)
        report(error, 'tip advertisedCommand check threw')
        return false
      }
    }
    try {
      if (!await tip.isRelevant()) return false
    } catch (error) {
      markFailed(tip.id)
      report(error, 'tip isRelevant threw')
      return false
    }
    if (sessionsSinceShown(tip.id) < tip.cooldownSessions) return false
    if (tip.maxLifetimeShows !== undefined &&
      lifetimeShown(tip.id) >= tip.maxLifetimeShows) return false
    return true
  }))
  return candidates.filter((_, index) => selected[index] === true)
}

/** Prefer the tip not seen for longest; priority only breaks a tie. */
export function selectLongestUnshown(availableTips: Tip[], sessionsSinceShown: (id: string) => number): Tip | undefined {
  return availableTips.map(tip => ({
    tip, sessions: sessionsSinceShown(tip.id),
  })).sort((a, b) =>
    a.sessions === b.sessions
      ? (b.tip.priority ?? 0) - (a.tip.priority ?? 0)
      : b.sessions - a.sessions
  )[0]?.tip
}

/** A broken tip must not blank the REPL or increment its impression count. */
export async function resolveTipContent(tip: Tip, theme: ThemeName, { markFailed, report }: SpinnerTipFailureHandler317): Promise<string> {
  try {
    return await tip.content({ theme })
  } catch (error) {
    markFailed(tip.id)
    report(error, 'tip content threw')
    return ''
  }
}
