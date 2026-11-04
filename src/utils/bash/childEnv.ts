/**
 * Bash imports the exported SHELLOPTS and BASHOPTS before reading its startup
 * files. Inheriting errexit/pipefail from the caller aborts unrelated commands
 * in the Bash tool. Shell state is reconstructed from the captured snapshot.
 */
export function cleanBashSpawnEnvironment<T extends Record<string, string | undefined>>(
  environment: T,
  shellType: string,
): Omit<T, 'SHELLOPTS' | 'BASHOPTS'> {
  if (shellType !== 'bash') return environment
  const { SHELLOPTS: _shellOptions, BASHOPTS: _bashOptions, ...clean } = environment
  return clean
}
