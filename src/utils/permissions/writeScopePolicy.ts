/**
 * Enforce the 2.1.314 write confinement policy even if a higher-precedence
 * source attempts to disable an enabled enterprise restriction.
 */
export function shouldRejectOutOfScopeWrite(managedEnabled: boolean | undefined, effectiveEnabled: boolean | undefined, insideWorkingDirectories: boolean): boolean {
  return (managedEnabled === true || effectiveEnabled === true) &&
    insideWorkingDirectories !== true
}
