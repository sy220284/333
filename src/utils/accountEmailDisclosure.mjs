/**
 * Claude Code 2.1.317 outbound account-email check.
 *
 * Equivalent to the official tool.check hook: inspect the entire submitted
 * input, decode percent-escaped bytes and require a network-capable shell
 * command before prompting. A local echo or file edit is not an exfiltration.
 * The caller must preserve prior tool-specific deny decisions.
 */
const WEB_TOOLS = new Set(['WebBrowser', 'WebFetch', 'WebSearch'])
const SHELL_TOOLS = new Set(['Bash', 'Monitor', 'PowerShell', 'Tmux'])
const NETWORK_COMMAND = /\b(curl|wget|https?|httpie|xh|nc|ncat|socat|telnet|ssh|scp|sftp|rsync|ftp|lftp|rclone|iwr|irm|invoke-webrequest|invoke-restmethod)\b/

export function shouldConfirmAccountEmailDisclosure(toolName, input, email) {
  if (!WEB_TOOLS.has(toolName) && !SHELL_TOOLS.has(toolName)) return false
  const target = typeof email === 'string' ? email.toLowerCase() : ''
  if (!target || !target.includes('@')) return false

  const rawInput = JSON.stringify(input).toLowerCase()
  const decoded = rawInput.replace(/%([0-9a-f]{2})/g, (_match, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
  const searchable = `${rawInput}\n${decoded}`.toLowerCase()
  if (!searchable.includes('@') || !searchable.includes(target)) return false

  // Remove the matching email first: a domain in the email must not itself
  // make the command appear to be an HTTP/FTP or similar network command.
  const commandContext = searchable
    .replaceAll(target, ' ')
    .replace(/\\(?:\\|[nrt])/g, ' ')

  return WEB_TOOLS.has(toolName) || NETWORK_COMMAND.test(commandContext)
}
