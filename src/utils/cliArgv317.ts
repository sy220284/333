/** Early argv traversal from 2.1.317 chunk-7bjr5mdw.js.
 * Values of other options and words after -- are never reinterpreted as flags.
 */
const VALUE_FLAGS = new Set(["--prefill", "--prefill-b64", "--deep-link-repo", "--deep-link-last-fetch", "--deep-link-cwd-b64", "--handle-uri", "--settings", "--managed-settings", "--setting-sources", "--client-data-url", "--watch-artifact", "--watch-artifact-no-autoreact", "--team-name", "--agent-id", "--agent-name", "--agent-color", "--parent-session-id", "--agent-type", "--model", "--agent", "--routine", "--effort", "--fast-mode", "--permission-mode", "--inherit-permission-mode", "--proactivity", "--debug-file", "--system-prompt", "--system-prompt-file", "--append-system-prompt", "--append-system-prompt-file", "--system-prompt-snapshot", "--append-subagent-system-prompt", "--append-subagent-system-prompt-file", "--plan-mode-instructions", "--permission-prompt-tool", "--permission-prompts", "--json-schema", "--fallback-model", "--advisor", "--agents", "--name", "-n", "--allowedTools", "--allowed-tools", "--disallowedTools", "--disallowed-tools", "--tools", "--add-dir", "--mcp-config", "--betas", "--file", "--channels", "--dangerously-load-development-channels", "--plugin-dir", "--plugin-dir-no-mcp", "--plugin-url", "--remote-control-session-name-prefix", "--exec", "-m", "--sdk-url", "--thinking", "--thinking-display", "--max-thinking-tokens", "--max-turns", "--max-budget-usd", "--task-budget", "--autocompact", "--rewind-files", "--resume-session-at", "--resume-drops-turn", "--workload", "--output-format", "--input-format", "--teammate-mode", "--messaging-socket-path", "--session-id", "--environment", "--pool", "--ref", "--on-branch", "--correlation-id", "--forward-home-settings", "--project-config-root", "--attach-serve", "--runner-declares", "--session-began-as-copy"])
const VARIADIC_FLAGS = new Set(["--allowedTools", "--allowed-tools", "--disallowedTools", "--disallowed-tools", "--tools", "--add-dir", "--mcp-config", "--betas", "--file", "--channels", "--dangerously-load-development-channels"])
const OPTIONAL_VALUE_FLAGS = new Set(["-d", "--debug", "-r", "--resume", "--from-pr", "-w", "--worktree", "--teleport", "--cloud", "--remote", "--project", "--remote-control", "--rc", "--prompt-suggestions"])
function looksLikeFlag(value: string): boolean { return value.length > 1 && value.startsWith('-') }
function skipValue(argv: string[], index: number): number {
  const word = argv[index]
  if (OPTIONAL_VALUE_FLAGS.has(word)) {
    const next = argv[index + 1]
    return next !== undefined && !looksLikeFlag(next) ? index + 1 : index
  }
  if (!VALUE_FLAGS.has(word)) return index
  let end = index + 1
  if (VARIADIC_FLAGS.has(word)) while (end + 1 < argv.length && !looksLikeFlag(argv[end + 1])) end++
  return end
}
export function getCliFlagValues(flag: string, argv: string[] = process.argv): string[] {
  const values = []
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]
    if (word === '--') break
    if (word?.startsWith(flag + '=')) { values.push(word.slice(flag.length + 1)); continue }
    if (word === flag && i + 1 < argv.length) { values.push(argv[++i]); continue }
    i = skipValue(argv, i)
  }
  return values
}
export function getCliFlagValue(flag: string, argv: string[] = process.argv): string | undefined { return getCliFlagValues(flag, argv).at(-1) }
export function findCliArgument(predicate: (word: string) => boolean, argv: string[] = process.argv): number {
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]
    if (word === '--') break
    if (word !== undefined && predicate(word)) return i
    i = skipValue(argv, i)
  }
  return -1
}
export function hasCliFlag(flag: string, argv: string[] = process.argv): boolean { return findCliArgument(word => word === flag, argv) !== -1 }
export function beforeDoubleDash(argv: string[]): string[] { const end = argv.indexOf('--'); return end === -1 ? argv : argv.slice(0, end) }
export function firstCliPositionalIndex(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') return i + 1 < argv.length ? i + 1 : -1
    if (!looksLikeFlag(argv[i])) return i
    i = skipValue(argv, i)
  }
  return -1
}
/** Only parsed CLI flags select print mode; option values and prompt data are inert. */
export function isPrintModeLaunch(argv: string[] = process.argv.slice(2)): boolean { return hasCliFlag('-p', argv) || hasCliFlag('--print', argv) }
export function isStreamJsonLaunch(argv: string[] = process.argv.slice(2)): boolean {
  const headless = isPrintModeLaunch(argv) || hasCliFlag('--init-only', argv) || findCliArgument(word => word.startsWith('--sdk-url'), argv) !== -1 || !process.stdout.isTTY
  return headless && getCliFlagValue('--output-format', argv) === 'stream-json'
}
/** 317 chunk-jygy021m.js: the OS handler passes exactly --handle-uri <URI>. */
export function rejectDeepLinkArgumentInjection(argv: string[] = process.argv): string | null {
  const index = argv.indexOf('--handle-uri')
  if (index === -1 || !argv[index + 1]) return null
  if (argv.length > index + 2) return 'claude: rejected deep-link invocation — unexpected arguments after the URI.\n' + 'The OS protocol handler passes exactly `--handle-uri <uri>`; extra arguments indicate argument injection via the URL. If invoking --handle-uri manually, place other flags before it.'
  return null
}

/** 2.1.317 chunk-7bjr5mdw.js: only six session verbs may follow root
 * options, and only with a full eight-hex-character session ID. This shared
 * scanner is used by both bootstrap routing and the background dispatcher. */
const BG_SESSION_VERBS_317 = new Set(['attach', 'logs', 'stop', 'kill', 'respawn', 'rm'])
const BG_DISALLOWED_PREFIX_317 = new Set(['-p', '--print', '--bg', '--background', '--routine', '-h', '--help', '-v', '-V', '--version'])
const BG_ROOT_BOOLEAN_317 = new Set(['-d2e', '--debug-to-stderr', '--verbose', '-p', '--print', '--bare', '--safe-mode', '--init', '--init-only', '--maintenance', '--include-hook-events', '--include-partial-messages', '--forward-subagent-text', '--session-mirror', '--await-claim', '--await-initialize', '--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', '--replay-user-messages', '--host-auth-is-org-sign-in', '--enable-auth-status', '--restricted', '--allow-other-models', '--exclude-dynamic-system-prompt-sections', '--include-unsupported-models', '-c', '--continue', '--fork-session', '--deep-link-origin', '--no-session-persistence', '--reply-on-resume', '--ide', '--desktop', '--strict-mcp-config', '--disable-slash-commands', '--chrome', '--no-chrome', '--tmux', '--enable-auto-mode', '--bg', '--background', '--agents-view-if-allowed', '--brief', '--ax-screen-reader', '--plan-mode-required', '--hard-fail'])
const BG_BAD_VALUE_FLAGS_317 = new Set(['--exec', '-m', '--handle-uri'])

export function backgroundSessionVerbIndex317(argv: string[] = process.argv.slice(2), { behindRootOptions = true }: { behindRootOptions?: boolean } = {}): number {
  const at = firstCliPositionalIndex(argv)
  if (at === -1 || !BG_SESSION_VERBS_317.has(argv[at])) return -1
  if (at === 0) return 0
  if (!behindRootOptions || argv[at - 1] === '--') return -1
  const id = argv[at + 1]
  if (id === undefined || !(/^[a-f0-9]{8}$/.test(id) || (argv[at] === 'respawn' && id === '--all'))) return -1
  for (let index = 0; index < at; index = skipValue(argv, index) + 1) {
    const word = argv[index]
    if (BG_DISALLOWED_PREFIX_317.has(word) || word.startsWith('--routine=') || /^-[A-Za-z]{2,}$/.test(word)) return -1
    const eq = word.indexOf('=')
    const flag = eq === -1 ? word : word.slice(0, eq)
    if (!BG_ROOT_BOOLEAN_317.has(word) &&
      !(VALUE_FLAGS.has(flag) && !BG_BAD_VALUE_FLAGS_317.has(flag)) &&
      !OPTIONAL_VALUE_FLAGS.has(flag)) return -1
  }
  return at
}
