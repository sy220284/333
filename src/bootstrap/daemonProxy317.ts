/**
 * 2.1.317 chunk-qpgjkj53.js sessionFactsRestored -> proxyAgentsInstalled.
 * The daemon must reject an invalid active proxy before reading a worker
 * kind or its stdin. Match the official proxy precedence and refusal text.
 */
export function checkDaemonStartupProxy317(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const source = ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY']
    .find(key => Boolean(env[key]))
  if (!source) return null
  const value = env[source]!
  try {
    if (new URL(value).host) return null
  } catch {
    // The upstream URL parser also treats hostless URLs as invalid proxies.
  }
  const cleaned = value.replace(/\p{Cc}/gu, '')
  return [
    `Invalid proxy URL in ${source}: "${cleaned}" cannot be parsed as a URL.`,
    'Proxy settings must be a complete URL including the scheme, e.g. "http://proxy.example.com:8080".',
    `Fix or unset ${source} and restart Claude Code.`,
    'Error: the proxy setting named above is refused.',
    'Start the daemon again once this is mended.',
  ].join('\n')
}
