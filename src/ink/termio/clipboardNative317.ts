import { createRequire } from 'node:module'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
  // Production --compile executables are installed via aliases/symlinks.
  // Locate the verified addon beside the physical executable first, matching
  // native audio and ripgrep resource resolution.
  const physicalExecutable = realpathSync(process.execPath)
  const installedRoot = dirname(physicalExecutable)
  // A compiled Bun executable must never load an addon from the checkout
  // where it was compiled. Such a fallback silently masks an incomplete
  // installation and can load a stale or ABI-incompatible native module.
  const compiled = typeof Bun !== 'undefined' &&
    !/(?:^|[\\/])bun(?:\.exe)?$/i.test(physicalExecutable)
  for (const suffix of [platform, platform + '-musl']) {
    const packagedAddon = join(installedRoot, 'vendor', 'clipboard-napi',
      suffix, 'clipboard-napi.node')
    if (existsSync(packagedAddon)) {
      const addon = load(packagedAddon)
      if (typeof addon?.setLinuxClipboardText !== 'function' ||
          typeof addon?.getLinuxClipboardText !== 'function') {
        throw new Error('Official 2.1.317 clipboard addon ABI mismatch: ' + packagedAddon)
      }
      cached = addon
      return cached
    }
    if (compiled) continue
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
export function isLinuxClipboardAddonLoadable() : boolean {
  return nativeClipboardAddon() !== null
}

/** X11 :0/unix:0 or a Wayland compositor local to the running process. */
export function isLocalLinuxClipboardDisplay(env: NodeJS.ProcessEnv = process.env) : boolean {
  if (env.DISPLAY) return /^(unix)?:/.test(env.DISPLAY)
  return Boolean(env.WAYLAND_DISPLAY)
}

/** The native extension returns false if the compositor cannot accept a write. */
export function writeLinuxClipboardNative(text: string) : boolean {
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
export async function readLinuxClipboardNative(primary: boolean = false, timeoutMs: number = 2000) : Promise<string> {
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
export function windowsClipboardWriteInvocation(platform: string) : { command: string; args: string[]; } {
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
