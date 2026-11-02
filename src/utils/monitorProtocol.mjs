import { isIP } from 'node:net'
/** 2.1.310 Monitor checks the fully parsed endpoint, including mapped IPv4. */
function mappedV4(ip) {
  if (isIP(ip) !== 6) return null
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized)
  if (!match) return null
  const high = Number.parseInt(match[1], 16)
  const low = Number.parseInt(match[2], 16)
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}
export function isPublicIp(ip) {
  const mapped = mappedV4(ip)
  if (mapped !== null) return isPublicIp(mapped)
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number)
    if (p[0] === 0 || p[0] === 10 || p[0] >= 224 ||
        p[0] === 169 && p[1] === 254 || p[0] === 172 && p[1] >= 16 && p[1] <= 31 ||
        p[0] === 192 && (p[1] === 168 || p[1] === 0 && p[2] === 0 || p[1] === 0 && p[2] === 2) ||
        p[0] === 100 && p[1] >= 64 && p[1] <= 127 ||
        p[0] === 198 && (p[1] === 18 || p[1] === 19 || p[1] === 51 && p[2] === 100) ||
        p[0] === 203 && p[1] === 0 && p[2] === 113) return false
    return true
  }
  if (isIP(ip) !== 6) return false
  const n = ip.toLowerCase()
  if (n === '::' || n.startsWith('fc') || n.startsWith('fd') ||
      n.startsWith('fe8') || n.startsWith('fe9') || n.startsWith('fea') ||
      n.startsWith('feb') || n.startsWith('ff') || n.startsWith('2001:db8:')) return false
  return true
}
export function validateMonitorWsUrl(value) {
  if (typeof value !== 'string' || /[^\x20-\x7e]/.test(value)) throw new Error('WebSocket URL must be printable ASCII')
  let u
  try { u = new URL(value) } catch { throw new Error('Invalid WebSocket URL') }
  if (!['ws:','wss:'].includes(u.protocol) || !u.hostname || u.username || u.password ||
      u.hash || !/^[\x00-\x7f]*$/.test(u.hostname)) {
    throw new Error('WebSocket requires ws:// or wss:// URL without credentials or fragments')
  }
  return u
}
export function validateMonitorArguments(value) {
  if (!value || !!value.command === !!value.ws) throw new Error('Exactly one of command or ws is required')
  if (!value.description?.trim()) throw new Error('Monitor description is required')
  if (value.command && /[\x00-\x08\x0b-\x1f\x7f]/.test(value.command)) throw new Error('Command contains hidden control characters')
  if (value.ws) {
    validateMonitorWsUrl(value.ws.url)
    if (value.ws.protocols && (!Array.isArray(value.ws.protocols) ||
      new Set(value.ws.protocols).size !== value.ws.protocols.length ||
      value.ws.protocols.some(v => typeof v !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(v)))) {
      throw new Error('Invalid WebSocket protocols')
    }
  }
  if (value.timeout_ms !== undefined && (!Number.isFinite(value.timeout_ms) ||
      value.timeout_ms < 1000 || value.timeout_ms > 3600000)) throw new Error('timeout_ms must be between 1000 and 3600000')
}
