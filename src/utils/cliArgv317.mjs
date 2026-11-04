/** Early argv traversal from 2.1.317 chunk-7bjr5mdw.js.
 * Values of other options and words after -- are never reinterpreted as flags.
 */
const VALUE_FLAGS = new Set(["--prefill", "--prefill-b64", "--deep-link-repo", "--deep-link-last-fetch", "--deep-link-cwd-b64", "--handle-uri", "--settings", "--managed-settings", "--setting-sources", "--client-data-url", "--watch-artifact", "--watch-artifact-no-autoreact", "--team-name", "--agent-id", "--agent-name", "--agent-color", "--parent-session-id", "--agent-type", "--model", "--agent", "--routine", "--effort", "--fast-mode", "--permission-mode", "--inherit-permission-mode", "--proactivity", "--debug-file", "--system-prompt", "--system-prompt-file", "--append-system-prompt", "--append-system-prompt-file", "--system-prompt-snapshot", "--append-subagent-system-prompt", "--append-subagent-system-prompt-file", "--plan-mode-instructions", "--permission-prompt-tool", "--permission-prompts", "--json-schema", "--fallback-model", "--advisor", "--agents", "--name", "-n", "--allowedTools", "--allowed-tools", "--disallowedTools", "--disallowed-tools", "--tools", "--add-dir", "--mcp-config", "--betas", "--file", "--channels", "--dangerously-load-development-channels", "--plugin-dir", "--plugin-dir-no-mcp", "--plugin-url", "--remote-control-session-name-prefix", "--exec", "-m", "--sdk-url", "--thinking", "--thinking-display", "--max-thinking-tokens", "--max-turns", "--max-budget-usd", "--task-budget", "--autocompact", "--rewind-files", "--resume-session-at", "--resume-drops-turn", "--workload", "--output-format", "--input-format", "--teammate-mode", "--messaging-socket-path", "--session-id", "--environment", "--pool", "--ref", "--on-branch", "--correlation-id", "--forward-home-settings", "--project-config-root", "--attach-serve", "--runner-declares", "--session-began-as-copy"])
const VARIADIC_FLAGS = new Set(["--allowedTools", "--allowed-tools", "--disallowedTools", "--disallowed-tools", "--tools", "--add-dir", "--mcp-config", "--betas", "--file", "--channels", "--dangerously-load-development-channels"])
const OPTIONAL_VALUE_FLAGS = new Set(["-d", "--debug", "-r", "--resume", "--from-pr", "-w", "--worktree", "--teleport", "--cloud", "--remote", "--project", "--remote-control", "--rc", "--prompt-suggestions"])
function looksLikeFlag(value) { return value.length > 1 && value.startsWith('-') }
function skipValue(argv, index) {
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
export function getCliFlagValues(flag, argv = process.argv) {
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
export function getCliFlagValue(flag, argv = process.argv) { return getCliFlagValues(flag, argv).at(-1) }
export function findCliArgument(predicate, argv = process.argv) {
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]
    if (word === '--') break
    if (word !== undefined && predicate(word)) return i
    i = skipValue(argv, i)
  }
  return -1
}
export function hasCliFlag(flag, argv = process.argv) { return findCliArgument(word => word === flag, argv) !== -1 }
export function beforeDoubleDash(argv) { const end = argv.indexOf('--'); return end === -1 ? argv : argv.slice(0, end) }
export function firstCliPositionalIndex(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') return i + 1 < argv.length ? i + 1 : -1
    if (!looksLikeFlag(argv[i])) return i
    i = skipValue(argv, i)
  }
  return -1
}
export function isStreamJsonLaunch(argv = process.argv.slice(2)) {
  const headless = hasCliFlag('-p', argv) || hasCliFlag('--print', argv) || hasCliFlag('--init-only', argv) || findCliArgument(word => word.startsWith('--sdk-url'), argv) !== -1 || !process.stdout.isTTY
  return headless && getCliFlagValue('--output-format', argv) === 'stream-json'
}
/** 317 chunk-jygy021m.js: the OS handler passes exactly --handle-uri <URI>. */
export function rejectDeepLinkArgumentInjection(argv = process.argv) {
  const index = argv.indexOf('--handle-uri')
  if (index === -1 || !argv[index + 1]) return null
  if (argv.length > index + 2) return 'claude: rejected deep-link invocation — unexpected arguments after the URI.\n' + 'The OS protocol handler passes exactly `--handle-uri <uri>`; extra arguments indicate argument injection via the URL. If invoking --handle-uri manually, place other flags before it.'
  return null
}
