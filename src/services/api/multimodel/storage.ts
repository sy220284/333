/** Shared storage root for all independent model metadata and probes. */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Resolve per operation: tests and embedded runtimes can change the active HOME. */
export function getModelStorageRoot(): string {
  const configuredHome = process.platform === 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME
  return join(configuredHome || homedir(), '.avenlo', 'models')
}
