/**
 * Enforce the 2.1.314 write confinement policy even if a higher-precedence
 * source attempts to disable an enabled enterprise restriction.
 */
export function shouldRejectOutOfScopeWrite(managedEnabled, effectiveEnabled, insideWorkingDirectories) {
  return (managedEnabled === true || effectiveEnabled === true) &&
    insideWorkingDirectories !== true
}
