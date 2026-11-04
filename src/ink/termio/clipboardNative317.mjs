import { createRequire } from 'node:module'

/**
 * Claude Code 2.1.317 Linux native clipboard extension. The shipped N-API
 * binary is verified against the official executable before packaging.
 *
 * Bundled CLI: ./vendor/clipboard-napi/<arch>-linux/clipboard-napi.node
 * Package layout: ../clipboard-napi/<arch>-linux/clipboard-napi.node
 * Source checkout: ../../../vendor/clipboard-napi/<arch>-linux/clipboard-napi.node
 */
const load = createRequire(import.meta.url)
let attempted = false
let cached = null

function nativeClipboardAddon() {
  if (process.platform !== 'linux') return null
  if (attempted) return cached
  attempted = true
  const platform = process.arch + '-linux'
  for (const suffix of [platform, platform + '-musl']) {
    for (const path of [
      './vendor/clipboard-napi/' + suffix + '/clipboard-napi.node',
      '../clipboard-napi/' + suffix + '/clipboard-napi.node',
      '../../../vendor/clipboard-napi/' + suffix + '/clipboard-napi.node',
    ]) {
      try {
        const addon = load(path)
        if (typeof addon?.setLinuxClipboardText === 'function' &&
            typeof addon?.getLinuxClipboardText === 'function') {
          cached = addon
          return cached
        }
      } catch {
        // These paths are mutually exclusive install layouts.
      }
    }
  }
  return null
}

/** Check the actual N-API export surface of the installed Linux addon. */
export function isLinuxClipboardAddonLoadable() {
  return nativeClipboardAddon() !== null
}

/** X11 :0/unix:0 or a Wayland compositor local to the running process. */
export function isLocalLinuxClipboardDisplay(env = process.env) {
  if (env.DISPLAY) return /^(unix)?:/.test(env.DISPLAY)
  return Boolean(env.WAYLAND_DISPLAY)
}

/** The native extension returns false if the compositor cannot accept a write. */
export function writeLinuxClipboardNative(text) {
  if (process.platform !== 'linux' || process.env.SSH_CONNECTION || !isLocalLinuxClipboardDisplay()) return false
  const addon = nativeClipboardAddon()
  if (!addon) return false
  try {
    return addon.setLinuxClipboardText(text) === true
  } catch {
    return false
  }
}

/** Used only after wl-paste / xclip / xsel have failed. */
export async function readLinuxClipboardNative(primary = false, timeoutMs = 2000) {
  if (process.platform !== 'linux' || process.env.SSH_CONNECTION || !isLocalLinuxClipboardDisplay()) return null
  const addon = nativeClipboardAddon()
  if (!addon) return null
  try {
    const value = await addon.getLinuxClipboardText(Boolean(primary), timeoutMs)
    return typeof value === 'string' ? value.replace(/\r?\n$|\r$/, '') : null
  } catch {
    return null
  }
}

/**
 * Original 2.1.317 Windows/WSL path: clipboard content arrives on stdin in
 * UTF-8. clip.exe interprets it through a locale-dependent code page.
 */
export function windowsClipboardWriteInvocation(platform) {
  if (platform !== 'windows' && platform !== 'wsl')
    throw new Error('Windows clipboard command requires Windows or WSL')
  return {
    command: platform === 'wsl' ? 'powershell.exe' : 'powershell',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::InputEncoding = [Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())',
    ],
  }
}
