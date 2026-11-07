/**
 * 2.1.317 teammate shutdown approval ordering.
 *
 * A late approval from a previous teammate instance must not remove a teammate
 * that joined (or rejoined under the same name/agent ID) afterwards.
 */
export function isStaleShutdownApproval(
  memberJoinedAt: number,
  approvalTimestamp: string,
): boolean {
  const approvedAt = Date.parse(approvalTimestamp)
  // An unverifiable timestamp cannot authorize a destructive shutdown.
  return !Number.isFinite(approvedAt) || memberJoinedAt >= approvedAt
}
