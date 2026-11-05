/**
 * Plugin-test hook admission as verified from the 2.1.317 CLI.
 * The ordinary test process and the hidden --file worker share this rule.
 *
 * Upstream: chunk-jsb8d11a.js pluginTestGatesOf/pluginTestRefusal,
 * and chunk-317bjwp5.js canLoadUserModules.
 */
export const HOOKS_DISABLED_FOR_PLUGIN_TEST_317 =
  'hooks modules are turned off here (disableAllHooks, allowManagedHooksOnly or a policy)'

type HooksSettings317 = {disableAllHooks?: unknown} | null | undefined
type ManagedHooks317 = {allowManagedHooksOnly?: unknown} | null | undefined

export function pluginTestHooksPolicyRefusal317(
  effective: HooksSettings317,
  managed: ManagedHooks317,
): string | null {
  if (effective?.disableAllHooks === true || managed?.allowManagedHooksOnly === true)
    return HOOKS_DISABLED_FOR_PLUGIN_TEST_317
  return null
}
