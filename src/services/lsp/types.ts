import type { z } from 'zod/v4'
import type { LspServerConfigSchema } from '../../utils/plugins/schemas.js'

/**
 * The producer schema is the single source of truth for plugin LSP configuration.
 * Its validated output supplies default 'stdio' transport and required
 * extensionToLanguage mappings. Consumers are LSPServerInstance,
 * LSPServerManager and lspPluginIntegration.
 */
export type LspServerConfig = z.infer<ReturnType<typeof LspServerConfigSchema>>

/** LSP declarations are scoped by the owning plugin. */
export type ScopedLspServerConfig = LspServerConfig & {
  scope: 'dynamic'
  source: string
}

/** Exact state machine used in createLSPServerInstance. */
export type LspServerState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'
