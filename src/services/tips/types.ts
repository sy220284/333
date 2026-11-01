/**
 * Spinner tips contract. Reconstructed from:
 * 2.1.88 services/tips/tipRegistry.ts (definitions and relevance filters),
 * services/tips/tipScheduler.ts (selection and display),
 * screens/REPL.tsx (theme, read-file cache and shell tool signals).
 */
import type { Theme } from '../../utils/theme.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'

/** The scheduler may evaluate relevance before contextual signals are available. */
export type TipContext = {
  theme?: Theme
  readFileState?: FileStateCache
  bashTools?: ReadonlySet<string>
}

export type Tip = {
  id: string
  cooldownSessions: number
  content: (context: { theme: Theme }) => Promise<string>
  isRelevant: (context?: TipContext) => Promise<boolean>
}
