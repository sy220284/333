/**
 * Config/settings-backed NODE_EXTRA_CA_CERTS population for `caCerts.ts`.
 *
 * Split from `caCerts.ts` because `config.ts` → `file.ts` →
 * `permissions/filesystem.ts` → `commands.ts` transitively pulls in ~5300
 * modules (REPL, React, every slash command). `proxy.ts`/`mtls.ts` (and
 * therefore anything using HTTPS through our proxy agent — WebSocketTransport,
 * CCRClient, telemetry) must NOT depend on that graph, or the Agent SDK
 * bundle (`connectRemoteControl` path) bloats from ~0.4 MB to ~10.8 MB.
 *
 * `getCACertificates()` only reads `process.env.NODE_EXTRA_CA_CERTS`. This
 * module populates that variable from trusted user settings during CLI startup. Only `init.ts` imports this file.
 */

import { logForDebugging } from './debug.js'
import { getSettingsForSource } from './settings/settings.js'

/**
 * Apply NODE_EXTRA_CA_CERTS from settings.json to process.env early in init,
 * BEFORE any TLS connections are made.
 *
 * Bun caches the TLS certificate store at process boot via BoringSSL.
 * If NODE_EXTRA_CA_CERTS isn't set in the environment at boot, Bun won't
 * include the custom CA cert. By setting it on process.env before any
 * TLS connections, we give Bun a chance to pick it up (if the cert store
 * is lazy-initialized) and ensure Node.js compatibility.
 *
 * This is safe to call before the trust dialog because we only read from
 * user-controlled settings (~/.claude/settings.json),
 * not from project-level settings.
 */
export function applyExtraCACertsFromConfig(): void {
  if (process.env.NODE_EXTRA_CA_CERTS) {
    return // Already set in environment, nothing to do
  }
  const configPath = getExtraCertsPathFromUserSettings()
  if (configPath) {
    process.env.NODE_EXTRA_CA_CERTS = configPath
    logForDebugging(
      `CA certs: Applied NODE_EXTRA_CA_CERTS from config to process.env: ${configPath}`,
    )
  }
}

/**
 * Read the trusted user-level settings.env certificate path before TLS startup.
 * Project-local settings cannot inject CA certs before trust approval.
 */
function getExtraCertsPathFromUserSettings(): string | undefined {
  try {
    // Only read from user-controlled settings (~/.claude/settings.json),
    // not project-level settings, to prevent malicious projects from
    // injecting CA certs before the trust dialog.
    const settings = getSettingsForSource('userSettings')
    const settingsEnv = settings?.env

    logForDebugging(
      `CA certs: User settings.env keys: ${settingsEnv ? Object.keys(settingsEnv).join(',') : 'none'}`,
    )

    const path = settingsEnv?.NODE_EXTRA_CA_CERTS
    if (path) {
      logForDebugging(
        `CA certs: Found NODE_EXTRA_CA_CERTS in user settings: ${path}`,
      )
    }
    return path
  } catch (error) {
    logForDebugging(`CA certs: User settings lookup failed: ${error}`, {
      level: 'error',
    })
    return undefined
  }
}
