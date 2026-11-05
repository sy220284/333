import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import {
  buildUltrareviewEnvironment,
  getUltrareviewClientWaitMinutes,
} from './ultrareviewConfig.ts'

function getReviewConfig(): Record<string, unknown> | null {
  return getFeatureValue_CACHED_MAY_BE_STALE<Record<string, unknown> | null>(
    'tengu_review_bughunter_config', null,
  )
}

/** One source of truth for interactive and standalone ultrareview sessions. */
export function getUltrareviewRuntimeEnvironment(): Record<string, string> {
  return buildUltrareviewEnvironment(getReviewConfig())
}

/** Polling and remote relay share the official, bounded client wait period. */
export function getUltrareviewClientTimeout(): { minutes: number; milliseconds: number } {
  const minutes = getUltrareviewClientWaitMinutes(getReviewConfig())
  return { minutes, milliseconds: minutes * 60_000 }
}
