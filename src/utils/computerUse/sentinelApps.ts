/**
 * 2.1.310 Computer Use application-sensitivity classification.
 * Source: chunk-mdxeekqd.js (oat/nat/rat/T_o/x_o/R_o/P_o/A_o/r$).
 * This classification adds a warning in the approval UI; the actual
 * permission decision remains with the caller and the user.
 *
 * The pre-PR7 research copy supported macOS only. The official target also
 * categorizes Windows executables, packaged Windows Terminal/PowerShell,
 * Explorer, and system settings.
 */
export type SentinelCategory = 'shell' | 'filesystem' | 'system_settings'

const MAC_SHELL_BUNDLE_IDS: ReadonlySet<string> = new Set([
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'com.microsoft.VSCode',
  'dev.warp.Warp-Stable',
  'com.github.wez.wezterm',
  'org.alacritty',
  'io.alacritty',
  'net.kovidgoyal.kitty',
  'co.zeit.hyper',
  'com.mitchellh.ghostty',
  'com.todesktop.230313mzl4w4u92',
  'com.vscodium',
  'com.exafunction.windsurf',
  'dev.zed.Zed',
  'org.tabby',
  'com.jetbrains.intellij',
  'com.jetbrains.pycharm',
])
const MAC_FILE_BUNDLE_IDS: ReadonlySet<string> = new Set(['com.apple.finder'])
const MAC_SETTINGS_BUNDLE_IDS: ReadonlySet<string> = new Set([
  'com.apple.systempreferences',
])
const WINDOWS_SHELL_EXECUTABLES: ReadonlySet<string> = new Set([
  'cmd.exe', 'powershell.exe', 'pwsh.exe', 'wt.exe',
  'windowsterminal.exe', 'code.exe', 'cursor.exe',
  'vscodium.exe', 'windsurf.exe', 'zed.exe', 'alacritty.exe',
  'wezterm-gui.exe', 'warp.exe', 'hyper.exe', 'tabby.exe',
  'idea64.exe', 'pycharm64.exe', 'conemu.exe', 'conemu64.exe',
])
const WINDOWS_SHELL_PACKAGES = [
  'Microsoft.WindowsTerminal_',
  'Microsoft.WindowsTerminalPreview_',
  'Microsoft.PowerShell_',
] as const
const WINDOWS_FILE_EXECUTABLES: ReadonlySet<string> = new Set(['explorer.exe'])
const WINDOWS_SETTINGS_EXECUTABLES: ReadonlySet<string> = new Set([
  'systemsettings.exe',
])
const WINDOWS_SETTINGS_PACKAGES = [
  'windows.immersivecontrolpanel_',
] as const

export const SENTINEL_BUNDLE_IDS: ReadonlySet<string> = new Set([
  ...MAC_SHELL_BUNDLE_IDS,
  ...MAC_FILE_BUNDLE_IDS,
  ...MAC_SETTINGS_BUNDLE_IDS,
])

export function getSentinelCategory(
  bundleIdOrExecutable: string,
): SentinelCategory | null {
  if (MAC_SHELL_BUNDLE_IDS.has(bundleIdOrExecutable)) return 'shell'
  if (MAC_FILE_BUNDLE_IDS.has(bundleIdOrExecutable)) return 'filesystem'
  if (MAC_SETTINGS_BUNDLE_IDS.has(bundleIdOrExecutable)) return 'system_settings'
  if (
    WINDOWS_SHELL_PACKAGES.some(prefix =>
      bundleIdOrExecutable.startsWith(prefix),
    )
  ) return 'shell'
  if (
    WINDOWS_SETTINGS_PACKAGES.some(prefix =>
      bundleIdOrExecutable.startsWith(prefix),
    )
  ) return 'system_settings'
  // Windows can report an executable path, not just a package ID.
  const filename = bundleIdOrExecutable.toLowerCase().split(/[\\/]/).pop() ?? ''
  if (WINDOWS_SHELL_EXECUTABLES.has(filename)) return 'shell'
  if (WINDOWS_FILE_EXECUTABLES.has(filename)) return 'filesystem'
  if (WINDOWS_SETTINGS_EXECUTABLES.has(filename)) return 'system_settings'
  return null
}
