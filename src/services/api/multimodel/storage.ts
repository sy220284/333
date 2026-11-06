/** Shared storage root for all independent model metadata and probes. */
import { homedir } from 'node:os'
import { join } from 'node:path'

const configuredHome = process.platform === 'win32'
  ? process.env.USERPROFILE
  : process.env.HOME

export const MODEL_STORAGE_ROOT = join(configuredHome || homedir(), '.333', 'models')
