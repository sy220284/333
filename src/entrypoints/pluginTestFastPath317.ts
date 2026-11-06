/**
 * Original 2.1.317 cli.js: plugin test is dispatched before importing the
 * interactive CLI. Keep this small entrypoint independent of main.tsx.
 *
 * The public handler already owns test discovery, module isolation, child
 * execution, reports and exit codes. This entrypoint only owns routing,
 * fast-path policy and process exit status.
 */
import { checkRequiredFastPathVersion317, ensureFastPathSettingsLoaded317 }
  from '../bootstrap/fastPathSettings317.ts'

export type PluginTestFastInvocation317 =
  | { kind: 'help' }
  | { kind: 'run'; directory: string; file?: string }

/** Leave invalid and extended argv forms to the existing Commander parser. */
export function parsePluginTestFastArgs317(
  args: readonly string[],
): PluginTestFastInvocation317 | null {
  if (args.length === 0) return { kind: 'run', directory: '.' }
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    return { kind: 'help' }
  }
  if (args.length === 1 && args[0] && !args[0].startsWith('-')) {
    return { kind: 'run', directory: args[0] }
  }
  if (args.length === 3 && args[0] === '--file' && args[1] && args[2]) {
    return { kind: 'run', directory: args[2], file: args[1] }
  }
  return null
}

const PLUGIN_TEST_HELP_317 = [
  'Usage: yaoyaoche plugin test [dir]',
  '',
  "Run a mod's tests",
  '',
  'Arguments:',
  "  dir         The mod's folder (default: the current folder)",
  '',
  'Options:',
  '  -h, --help  Display help for command',
  '',
  'Runs every *.test.ts and *.test.tsx under dir, each file in a child of this',
  "binary, in an environment like the one the mod's hooks run in. A test file",
  "imports its kit from 'claude-code/testing'. Exits 1 when a test fails.",
  '',
].join('\n')

export async function runPluginTestFastPath317(
  args: readonly string[],
): Promise<boolean> {
  const invocation = parsePluginTestFastArgs317(args)
  try {
    // Original pluginTestGatesOf runs even for --help/invalid arguments.
    // Worker refusals are reported through the same stdout protocol as tests.
    const { encodePluginTestGateReport317 } = await import('../cli/handlers/pluginTestWire317.ts')
    const refuse = (message: string): boolean => {
      if (args[0] === '--file') {
        process.stdout.write(encodePluginTestGateReport317(args[1], message))
      } else {
        process.stderr.write('claude plugin test: ' + message + '\n')
        process.exitCode = 1
      }
      return true
    }
    // Dedicated worker paths still load organization policy before execution.
    const policy = await ensureFastPathSettingsLoaded317()
    const refusal = checkRequiredFastPathVersion317(MACRO.VERSION, policy)
    if (refusal) return refuse(refusal)
    const { getInitialSettings, getSettingsForSource } =
      await import('../utils/settings/settings.js')
    const { pluginTestHooksPolicyRefusal317 } =
      await import('./pluginTestGates317.ts')
    const hooksRefusal = pluginTestHooksPolicyRefusal317(
      getInitialSettings(), getSettingsForSource('policySettings'))
    if (hooksRefusal) return refuse(hooksRefusal)
    if (!invocation) return false
    if (invocation.kind === 'help') {
      process.stdout.write(PLUGIN_TEST_HELP_317)
      return true
    }
    const { pluginTestHandler317 } = await import('../cli/handlers/pluginTest317.ts')
    process.exitCode = await pluginTestHandler317(
      invocation.directory,
      invocation.file ? { file: invocation.file } : {},
    )
  } catch (error) {
    process.stderr.write('claude plugin test: ' +
      (error instanceof Error ? error.message : String(error)) + '\n')
    process.exitCode = 1
  }
  return true
}
