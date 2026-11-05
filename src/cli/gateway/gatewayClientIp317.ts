import { isIP, type BlockList } from 'node:net'

/** Return the nearest untrusted peer through a trusted reverse-proxy chain. */
function isTrusted(address: string, proxies: BlockList): boolean {
  const family = isIP(address)
  return family !== 0 && proxies.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

export function resolveGatewayClientIp317(
  remote: string | null,
  forwarded: string | null,
  proxies: BlockList,
): string | null {
  if (!remote || !isIP(remote)) return null
  if (!isTrusted(remote, proxies) || !forwarded) return remote
  const hops = forwarded.split(',').map(ip => ip.trim())
  // Malformed proxy metadata is never allowed to bypass the IP policy.
  if (hops.some(ip => !isIP(ip))) return null
  let candidate = remote
  for (let index = hops.length - 1; index >= 0; index--) {
    if (!isTrusted(candidate, proxies)) return candidate
    candidate = hops[index]
  }
  return candidate
}
