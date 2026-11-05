/** Official 2.1.317 chunk-1cyj5bw5.js REPORT_MARK. */
export const PLUGIN_TEST_REPORT_MARK_317 = 'claude-plugin-test-report '

export type PluginTestGateReport317 = {
  file: string | undefined
  results: []
  error: string
}

/**
 * A refused --file worker must produce a single parseable report on stdout
 * and exit normally. The parent reads this as a failed test file.
 */
export function encodePluginTestGateReport317(file: string | undefined, error: string): string {
  const report: PluginTestGateReport317 = {file, results: [], error}
  return PLUGIN_TEST_REPORT_MARK_317 + JSON.stringify(report) + '\n'
}
