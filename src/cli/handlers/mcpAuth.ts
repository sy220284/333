/** MCP login/logout, ported from 2.1.317 chunk-zchq3qdt and chunk-z3skx0pz. */
import { quote } from 'shell-quote'
import { createInterface, type Interface } from 'node:readline'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getClaudeAIOAuthTokens, isAnthropicAuthEnabled } from '../../utils/auth.js'
import { getOauthConfig } from '../../constants/oauth.js'
import { AuthenticationCancelledError, performMCPOAuthFlow, revokeServerTokens } from '../../services/mcp/auth.js'
import { removeMcpAuthCacheEntry } from '../../services/mcp/client.js'
import { getAllMcpConfigs, getMcpConfigByName, isMcpServerDisabled } from '../../services/mcp/config.js'
import type { ScopedMcpServerConfig } from '../../services/mcp/types.js'
import { getProjectMcpServerStatus } from '../../services/mcp/utils.js'
import { getGlobalConfig } from '../../utils/config.js'
import { openBrowser } from '../../utils/browser.js'
import { errorMessage } from '../../utils/errors.js'
import { cliError, cliOk } from '../exit.js'

const hostedHosts = new Set(['microsoft365.mcp.claude.com', 'gmail.mcp.claude.com', 'gcal.mcp.claude.com'])

export function classifyMcpLogin(config: ScopedMcpServerConfig) {
  if (config.type === 'claudeai-proxy') return { kind: 'claudeai-proxy' as const, config }
  if (config.type !== 'sse' && config.type !== 'http') return { kind: 'unsupported-transport' as const }
  let host = ''
  try { host = new URL(config.url).hostname.toLowerCase().replace(/\.$/, '') } catch { /* OAuth reports invalid configured URLs. */ }
  const override = getFeatureValue_CACHED_MAY_BE_STALE<unknown>('tengu_mcp_local_oauth_blocked_hosts', { hosts: [...hostedHosts] })
  const candidates = override && typeof override === 'object' && 'hosts' in override && Array.isArray(override.hosts)
    ? override.hosts.filter((value): value is string => typeof value === 'string') : []
  const blocked = candidates.length ? new Set(candidates.map(value => value.toLowerCase().replace(/\.$/, ''))) : hostedHosts
  if (blocked.has(host)) return { kind: 'anthropic-hosted' as const, config }
  return { kind: 'oauth' as const, config }
}

function usesClaudeLogin(url: string): boolean {
  let parsed: URL
  try { parsed = new URL(url) } catch { return false }
  return parsed.protocol === 'https:' && parsed.host === 'api.anthropic.com' &&
    (parsed.pathname.startsWith('/v1/design/') || parsed.pathname.startsWith('/v1/claude/test/') || parsed.pathname === '/v1/pages/mcp') &&
    isAnthropicAuthEnabled() && !!getClaudeAIOAuthTokens()?.accessToken
}

async function lookupServer(name: string): Promise<ScopedMcpServerConfig> {
  const { servers } = await getAllMcpConfigs()
  const server = servers[name]
  if (server) return server
  // getAllMcpConfigs deliberately excludes unapproved project servers. Explain
  // their state without bypassing the same approval boundary used at startup.
  const pending = getMcpConfigByName(name)
  if (pending?.scope === 'project') {
    const status = getProjectMcpServerStatus(name)
    if (status === 'rejected') return cliError(`"${name}" is from .mcp.json and was rejected. Run \`claude mcp reset-project-choices\` to review it again.`)
    if (status !== 'approved') return cliError(`"${name}" is from .mcp.json and awaiting approval. Run \`claude\` in this directory to review it first.`)
  }
  return cliError(`No MCP server found with name "${name}".${Object.keys(servers).length ? ` Available servers: ${Object.keys(servers).join(', ')}` : ''}`)
}

function hostedMessage(name: string, scope?: string): string {
  const remove = ['local', 'project', 'user'].includes(scope ?? '') ? ` Remove the stale entry with: \`${quote(['claude', 'mcp', 'remove', name])}\`` : ''
  return `"${name}" is Anthropic-hosted and doesn't support local OAuth. Connect it via Settings → Connectors on claude.ai (requires \`claude login\`), then it'll be available here automatically.${remove}`
}

function authorizationMessage(browser: boolean, url: string): string {
  return `${browser ? "If the browser didn't open, visit:" : 'Visit this URL to authorize:'}\n  ${url}\n\n`
}

export async function mcpLoginHandler(name: string, options: { browser: boolean }): Promise<void> {
  const result = classifyMcpLogin(await lookupServer(name))
  if (result.kind === 'unsupported-transport') return cliError(`"${name}" doesn't support OAuth login — it's only available for HTTP and SSE servers.`)
  if (result.kind === 'anthropic-hosted') return cliError(hostedMessage(name, result.config.scope))
  if (result.kind === 'claudeai-proxy') {
    const org = getGlobalConfig().oauthAccount?.organizationUuid
    if (!org || !result.config.id) return cliError(`Couldn't build the claude.ai authorization link for "${name}". Make sure you're signed in (\`claude login\`).`)
    const id = result.config.id.replace(/^mcprs/, 'mcpsrv')
    const url = `${getOauthConfig().CLAUDE_AI_ORIGIN}/api/organizations/${encodeURIComponent(org)}/mcp/start-auth/${encodeURIComponent(id)}?product_surface=${encodeURIComponent(process.env.CLAUDE_CODE_ENTRYPOINT || 'cli')}`
    if (options.browser) await openBrowser(url)
    process.stdout.write(authorizationMessage(options.browser, url))
    await removeMcpAuthCacheEntry(name)
    return cliOk('Once authorized on claude.ai, the connector will be available the next time you start Claude Code.')
  }
  const config = result.config
  if (Object.keys(config.headers ?? {}).some(key => key.toLowerCase() === 'authorization')) {
    return cliError(`"${name}" authenticates with the \`Authorization\` header in its configuration, so there's no separate login. Update that header to change its credentials.`)
  }
  if (usesClaudeLogin(config.url)) return cliError(`"${name}" authenticates automatically with your Claude login. Run \`claude login\` if you're not signed in.`)
  process.stdout.write(`Starting authentication for "${name}"…\n`)
  const controller = new AbortController()
  let terminal: Interface | undefined
  let noTerminal = false
  const abort = () => controller.abort()
  let cancel: (() => void) | undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(new AuthenticationCancelledError())
    controller.signal.addEventListener('abort', cancel, { once: true })
  })
  void cancelled.catch(() => {})
  process.once('SIGINT', abort)
  // OAuth setup can be waiting on promises without a referenced socket yet.
  const keepAlive = setInterval(() => {}, 60_000)
  try {
    await revokeServerTokens(name, config, { preserveStepUpState: true })
    await Promise.race([cancelled, performMCPOAuthFlow(name, config, url => {
      process.stdout.write(authorizationMessage(options.browser, url) + 'Waiting for authorization… (^C to cancel)\n')
      terminal?.prompt()
    }, controller.signal, {
      skipBrowserOpen: !options.browser,
      onWaitingForCallback: submit => {
        if (!process.stdin.isTTY) { noTerminal = true; controller.abort(); return }
        if (!process.stdout.isTTY) return
        terminal = createInterface({ input: process.stdin, output: process.stdout, prompt: 'Or paste the redirect URL here: ' })
        terminal.on('SIGINT', abort)
        terminal.on('close', abort)
        terminal.on('line', line => {
          if (submit(line.trim())) return
          if (line.trim()) process.stdout.write("That doesn't look like a redirect URL for this sign-in — paste the full address from the browser page this sign-in opened.\n")
          terminal?.prompt()
        })
      },
    })])
  } catch (error) {
    if (error instanceof AuthenticationCancelledError) {
      if (noTerminal) return cliError(`Couldn't complete authentication for "${name}": stdin isn't a terminal, so authentication can't be completed here. Re-run in an interactive terminal — e.g. \`ssh -t\` — and paste the redirect URL when prompted.`)
      process.exitCode = 130
      return
    }
    return cliError(`Couldn't complete authentication for "${name}": ${errorMessage(error)}`)
  } finally {
    clearInterval(keepAlive)
    if (cancel) controller.signal.removeEventListener('abort', cancel)
    process.removeListener('SIGINT', abort)
    terminal?.removeListener('close', abort)
    terminal?.close()
  }
  await removeMcpAuthCacheEntry(name)
  return cliOk(isMcpServerDisabled(name)
    ? `Authenticated with "${name}", but it's currently disabled. Enable it in /mcp for its tools to load.`
    : `Authenticated with "${name}". Its tools are now available in Claude Code.`)
}

export async function mcpLogoutHandler(name: string): Promise<void> {
  const result = classifyMcpLogin(await lookupServer(name))
  if (result.kind === 'claudeai-proxy') return cliOk(`"${name}" is a claude.ai connector — its credentials live on claude.ai, not this machine. Disconnect it at ${getOauthConfig().CLAUDE_AI_ORIGIN}/customize/connectors`)
  if (result.kind === 'unsupported-transport') return cliError(`"${name}" doesn't use OAuth — there are no stored credentials to clear.`)
  try {
    await revokeServerTokens(name, result.config)
    await removeMcpAuthCacheEntry(name)
  } catch (error) {
    return cliError(`Couldn't clear credentials for "${name}": ${errorMessage(error)}`)
  }
  if (result.kind === 'anthropic-hosted') return cliOk(`Cleared local credentials for "${name}". ${hostedMessage(name, result.config.scope)}`)
  const hint = (Object.keys(result.config.headers ?? {}).some(key => key.toLowerCase() === 'authorization') || usesClaudeLogin(result.config.url)) ? '' : ` Run \`${quote(['claude', 'mcp', 'login', name])}\` to authenticate again.`
  return cliOk(`Signed out of "${name}".${hint}`)
}
