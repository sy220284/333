/**
 * Clipboard OSC 52 transport rules from Claude Code 2.1.317
 * (official Linux x64: chunk-3cs9b1gj.js, zA / IH).
 * Pure functions keep the terminal protocol testable without a live TTY.
 */
export function clipboardMultiplexer(environment = process.env) : "tmux" | "screen" | "zellij" {
  if (environment.TMUX) return 'tmux'
  if (environment.STY) return 'screen'
  if (environment.ZELLIJ) return 'zellij'
  return null
}

const ESC = '\x1b'
const BEL = '\x07'
const ST = ESC + '\\'
const SCREEN_CHUNK_LENGTH = 76

export function encodeClipboardOsc52(base64, mux = null, terminator = BEL) : string {
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('OSC 52 payload must be base64')
  }
  const canonical = ESC + ']52;c;' + base64 + BEL
  switch (mux) {
    case 'tmux':
      return canonical + ESC + 'Ptmux;' + canonical.replaceAll(ESC, ESC + ESC) + ST
    case 'screen': {
      const chunks = []
      for (let i = 0; i < base64.length; i += SCREEN_CHUNK_LENGTH) {
        chunks.push(base64.slice(i, i + SCREEN_CHUNK_LENGTH))
      }
      return ESC + 'P' + ESC + ']52;c;' + chunks.join(ST + ESC + 'P') + BEL + ST
    }
    default:
      return ESC + ']52;c;' + base64 + terminator
  }
}

/**
 * Original 317 VTE safety test. OSC 52 is suppressed only if the terminal is
 * known to print unknown OSC sequences or if a native copy has already
 * succeeded on a VTE-based Linux/WSL terminal.
 */
export function isVteTerminal(terminal, environment = process.env) : boolean {
  const has = name => (environment[name] ?? '').trim() !== ''
  return has('VTE_VERSION') &&
    (terminal === 'vte-based' || terminal === 'gnome-terminal') &&
    (environment.TERM ?? '').trim().startsWith('xterm') &&
    !has('TMUX') && !has('STY') && environment.ZELLIJ === undefined &&
    !has('XTERM_VERSION') && !has('ALACRITTY_WINDOW_ID') &&
    !has('ALACRITTY_LOG') && !has('KITTY_WINDOW_ID') &&
    !has('WEZTERM_PANE') && !has('INSIDE_EMACS') &&
    !has('VIM_TERMINAL') && !has('NVIM')
}

export function suppressClipboardOsc52({
  platform, terminal, nativeWriteSucceeded = false,
  environment = process.env, printsUnknownSequences = false,
}) : boolean {
  if (printsUnknownSequences) return true
  if (!isVteTerminal(terminal, environment)) return false
  const version = Number.parseInt(environment.VTE_VERSION ?? '', 10)
  if (version < 5300) return true
  return nativeWriteSucceeded && (platform === 'linux' || platform === 'wsl')
}
