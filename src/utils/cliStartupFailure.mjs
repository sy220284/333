/** Convert an unhandled CLI initialization rejection into an observable failed
 * process. In --print mode the caller must never receive exit 0 and no output.
 */
export function reportCliStartupFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
  process.stderr.write(`Error: ${message}\n`)
}
