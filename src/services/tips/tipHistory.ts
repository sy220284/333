import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

export function recordTipShown(tipId: string): void {
  const numStartups = getGlobalConfig().numStartups
  saveGlobalConfig(c => {
    const history = c.tipsHistory ?? {}
    if (history[tipId] === numStartups) return c
    return {
      ...c,
      tipsHistory: { ...history, [tipId]: numStartups },
      tipLifetimeShows: {
        ...c.tipLifetimeShows,
        [tipId]: (c.tipLifetimeShows?.[tipId] ?? 0) + 1,
      },
    }
  })
}

export function getSessionsSinceLastShown(tipId: string): number {
  const config = getGlobalConfig()
  const lastShown = config.tipsHistory?.[tipId]
  if (!lastShown) return Infinity
  return config.numStartups - lastShown
}

/** Total recorded impressions, independent of session cooldown. */
export function getTipLifetimeShows(tipId: string): number {
  return getGlobalConfig().tipLifetimeShows?.[tipId] ?? 0
}
