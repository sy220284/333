/**
 * 333 only exposes the interactive AI conversation interface.
 *
 * Administrative subcommands and private transport/worker processes continue
 * to operate without a TTY: they support the interactive application and are
 * not standalone headless conversation entrypoints.
 */
import { findCliArgument, firstCliPositionalIndex } from '../utils/cliArgv317.ts'

export const INTERACTIVE_ONLY_FLAGS_317 = new Set([
  '--print',
  '--output-format',
  '--input-format',
  '--json-schema',
  '--include-hook-events',
  '--include-partial-messages',
  '--replay-user-messages',
  '--forward-subagent-text',
  '--permission-prompt-tool',
  '--permission-prompts',
  '--sdk-url',
  '--enable-auth-status',
  '--no-session-persistence',
  '--resume-session-at',
  '--max-thinking-tokens',
  '--max-turns',
  '--max-budget-usd',
  '--session-mirror',
  '--prompt-suggestions',
  '--workload',
  '--init-only',
])

const ADMINISTRATIVE_COMMANDS = new Set([
  'mcp', 'plugin', 'auth', 'doctor', 'update', 'upgrade', 'install',
  'setup-token', 'self-hosted-runner', 'gateway', 'purge',
  'ultrareview', 'agents', 'attach', 'logs', 'stop', 'kill',
  'respawn', 'rm', 'daemon', 'background', 'sessions',
  'session', 'login', 'logout', 'status', 'config',
])

const INTERNAL_WORKER_FLAGS = new Set([
  '--bg-pty-host', '--daemon-worker', '--bg-spare', '--preload',
  '--eval-mock-server', '--claude-in-chrome-mcp',
  '--chrome-native-host', '--computer-use-mcp', '--internal-bg-supervisor',
  '--handle-uri', '--dump-system-prompt',
])

function forbiddenFlag(word: string): boolean {
  const name = word.split('=', 1)[0]!
  // Commander also accepts combined short flags, including -vp and -pPROMPT.
  if (name.startsWith('-') && !name.startsWith('--') && name.slice(1).includes('p')) {
    return true
  }
  return INTERACTIVE_ONLY_FLAGS_317.has(name)
}

export function getInteractiveOnlyError317(
  argv: string[],
  terminal: { stdinIsTTY: boolean; stdoutIsTTY: boolean },
): string | null {
  const at = findCliArgument(forbiddenFlag, argv)
  if (at !== -1) {
    const option = argv[at]!.split('=', 1)[0]
    return `333 已移除非交互模式（${option}）。请在终端运行 333，进入交互式界面后提交任务。`
  }

  const helpOrVersion = findCliArgument(
    word => ['-h', '--help', '-v', '-V', '--version'].includes(word),
    argv,
  ) !== -1
  if (helpOrVersion) return null

  const atCommand = firstCliPositionalIndex(argv)
  const command = atCommand === -1 ? undefined : argv[atCommand]
  if (command && ADMINISTRATIVE_COMMANDS.has(command)) return null
  if (argv[0] && INTERNAL_WORKER_FLAGS.has(argv[0])) return null

  if (!terminal.stdinIsTTY || !terminal.stdoutIsTTY) {
    return '333 仅支持交互式会话。请在具有输入和输出终端的环境中启动 333。'
  }

  return null
}
