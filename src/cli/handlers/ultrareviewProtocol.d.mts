export const REMOTE_REVIEW_TAG: 'remote-review'
export const REMOTE_REVIEW_PROGRESS_TAG: 'remote-review-progress'
export function extractTag(text: string, tag: string): string | undefined
export function textOfReviewEvent(event: unknown): string
export function extractLatestRemoteReview(events: readonly unknown[]): string | undefined
export function formatRemoteReviewFindings(text: string): string
