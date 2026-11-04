/**
 * Classify 2.1.317 bootstrap-only routes before importing the full CLI.
 *
 * Keep command detection anchored at argv[0] and inspect option words only
 * before "--": prompt text must never launch background processes or worktrees.
 * The actual feature, trust and policy gates remain in the route handlers.
 */
import { beforeDoubleDash, hasCliFlag, findCliArgument } from '../utils/cliArgv317.mjs'

const BACKGROUND_COMMANDS = new Set([
  'agents', 'attach', 'logs', 'stop', 'kill', 'respawn', 'rm', 'daemon',
])

export function classifyStartupArgs(args) {
  const flagWords = beforeDoubleDash(args)
  const command = flagWords[0]
  // Use the official argv scanner: option values (e.g. --prefill "--bg")
  // must not be mistaken for standalone mode switches.
  const has = flag => hasCliFlag(flag, flagWords)
  const tmux = has('--tmux') || has('--tmux=classic')
  const worktree = has('-w') || has('--worktree') ||
    findCliArgument(arg => arg.startsWith('--worktree='), flagWords) !== -1
  return {
    flagWords,
    command,
    backgroundRequest: has('--bg') || has('--background') ||
      command === '--internal-bg-supervisor' || BACKGROUND_COMMANDS.has(command),
    tmuxWorktreeRequest: tmux && worktree,
  }
}
