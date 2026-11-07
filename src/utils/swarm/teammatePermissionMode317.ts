import type { PermissionMode } from '../../types/permissions.js'

/**
 * Transport-agnostic permission mode for a new teammate process.
 *
 * The leader's current mode always wins over startup configuration. When no
 * mode was supplied, preserve only an explicitly active bypass session.
 * Internal "bubble" has no CLI representation; default is its conservative
 * permission boundary when a new independent process is launched.
 */
export function teammatePermissionCliFlags317(
  mode: PermissionMode | undefined,
  planModeRequired: boolean,
  sessionBypass: boolean,
): string {
  if (planModeRequired || mode === 'plan') return '--permission-mode plan'
  if (mode === 'bypassPermissions' || (mode === undefined && sessionBypass)) {
    return '--dangerously-skip-permissions'
  }
  return `--permission-mode ${mode === 'bubble' ? 'default' : (mode ?? 'default')}`
}
