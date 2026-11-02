import { describe, expect, test } from 'bun:test'
import {
  SENTINEL_BUNDLE_IDS,
  getSentinelCategory,
} from '../src/utils/computerUse/sentinelApps.js'

describe('2.1.310 Computer Use sensitive app permission labels', () => {
  test.each([
    ['com.apple.Terminal', 'shell'],
    ['com.microsoft.VSCode', 'shell'],
    ['org.alacritty', 'shell'],
    ['co.zeit.hyper', 'shell'],
    ['com.mitchellh.ghostty', 'shell'],
    ['dev.zed.Zed', 'shell'],
    ['com.apple.finder', 'filesystem'],
    ['com.apple.systempreferences', 'system_settings'],
  ])('macOS bundle %s belongs to %s', (bundleId, category) => {
    expect(getSentinelCategory(bundleId)).toBe(category)
    expect(SENTINEL_BUNDLE_IDS.has(bundleId)).toBe(true)
  })

  test.each([
    ['cmd.exe', 'shell'],
    ['powershell.exe', 'shell'],
    ['pwsh.exe', 'shell'],
    ['C:\\Windows\\System32\\cmd.exe', 'shell'],
    ['C:\\Program Files\\Microsoft VS Code\\Code.EXE', 'shell'],
    ['C:\\Windows\\explorer.exe', 'filesystem'],
    ['C:\\Windows\\ImmersiveControlPanel\\SystemSettings.exe', 'system_settings'],
    ['Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'shell'],
    ['Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe', 'shell'],
    ['Microsoft.PowerShell_8wekyb3d8bbwe', 'shell'],
    ['windows.immersivecontrolpanel_cw5n1h2txyewy', 'system_settings'],
  ])('Windows ID or executable %s belongs to %s', (appId, category) => {
    expect(getSentinelCategory(appId)).toBe(category)
  })

  test('ordinary applications do not receive an escalation warning', () => {
    for (const value of [
      'com.example.texteditor',
      'notepad.exe',
      'C:\\Users\\Public\\Documents\\report.txt',
    ]) {
      expect(getSentinelCategory(value)).toBeNull()
    }
  })
})
