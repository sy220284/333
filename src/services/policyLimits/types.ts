import { z } from 'zod/v4'
import { lazySchema } from '../../utils/lazySchema.js'

/**
 * Schema for the policy limits API response
 * Only blocked policies are included. If a policy key is absent, it's allowed.
 */
export const PolicyLimitsResponseSchema = lazySchema(() =>
  z.object({
    restrictions: z.record(z.string(), z.object({ allowed: z.boolean() })),
    artifact_create_notice: z.object({ text: z.string() }).nullish(),
  }),
)

export type PolicyLimitsResponse = z.infer<
  ReturnType<typeof PolicyLimitsResponseSchema>
>

/**
 * Result of fetching policy limits
 */
export type PolicyLimitsFetchResult = {
  success: boolean
  restrictions?: PolicyLimitsResponse['restrictions'] | null // null means 304 Not Modified (cache is valid)
  artifactCreateNotice?: string
  routeMissing?: boolean
  etag?: string
  error?: string
  skipRetry?: boolean // If true, don't retry on failure (e.g., auth errors)
}
