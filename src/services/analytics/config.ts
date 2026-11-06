/**
 * Shared analytics configuration
 *
 * Common privacy policy for local diagnostic collection
 */

import { isTelemetryDisabled } from '../../utils/privacyLevel.js'

/**
 * Check if analytics operations should be disabled
 *
 * Analytics is disabled in the following cases:
 * - Test environment (NODE_ENV === 'test')
 * - Local diagnostics are disabled by the privacy setting
 */
export function isAnalyticsDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || isTelemetryDisabled()
}

/**
 * Check if the feedback survey should be suppressed.
 *
 * Unlike isAnalyticsDisabled(), this does NOT block on 3P providers
 * (Bedrock/Vertex/Foundry). The survey is a local UI prompt with no
 * transcript data — enterprise customers capture responses via OTEL.
 */
export function isFeedbackSurveyDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || isTelemetryDisabled()
}
