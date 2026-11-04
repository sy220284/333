/**
 * Enterprise gateway 2.1.317 configuration contract.
 * No permissive defaults for authentication, database or public exposure.
 */
import { readFile } from 'node:fs/promises'
import { validateGatewayAdmin317 } from './gatewayAdmin317.mjs'
import { validateCriConfig317 } from './gatewayCri317.mjs'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const nonempty = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(name + ' must be a nonempty string')
  return value
}
const positiveInteger = (value, fallback, name) => {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(name + ' must be a positive integer')
  return value
}
const safeHttps = (value, name) => {
  const url = new URL(nonempty(value, name))
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
    throw new Error(name + ' requires https (or explicit loopback)')
  }
  if (url.username || url.password || url.hash) throw new Error(name + ' cannot contain credentials or a fragment')
  return url.toString().replace(/\/$/, '')
}
const safeStore = value => {
  const url = new URL(nonempty(value, 'store.postgres_url'))
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('store.postgres_url must use postgres://host/database')
  }
  if (url.hostname.includes(',')) throw new Error('Postgres multi-host URLs are not supported')
  return value
}
function validateUpstream(item, names) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('upstream must be a map')
  const name = nonempty(item.name, 'upstream.name')
  if (names.has(name)) throw new Error('Duplicate upstream: ' + name)
  names.add(name)
  if (item.provider !== 'anthropic') {
    throw new Error('The selected gateway build does not yet implement upstream provider: ' + item.provider)
  }
  if (!item.auth || (typeof item.auth.api_key !== 'string' && typeof item.auth.oauth_token !== 'string')) {
    throw new Error('Anthropic upstream ' + name + ' requires auth.api_key or auth.oauth_token')
  }
  const base_url = safeHttps(item.base_url ?? 'https://api.anthropic.com', 'upstream.base_url')
  for (const field of ['models','groups']) {
    if (item[field] !== undefined && (!Array.isArray(item[field]) || !item[field].length ||
      item[field].some(x => typeof x !== 'string' || !x))) {
      throw new Error('upstream.' + field + ' must be a nonempty list of names')
    }
  }
  const headers = item.headers ?? {}
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('upstream.headers must be a mapping')
  const reserved = /^(authorization|host|connection|content-length|transfer-encoding|x-api-key|anthropic-|x-stainless-|x-claude-gateway-)/i
  for (const [key, value] of Object.entries(headers)) {
    if (reserved.test(key) || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) {
      throw new Error('upstream.headers contains forbidden header ' + key)
    }
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error('invalid upstream header ' + key)
  }
  return { ...item, name, base_url, headers }
}
export function validateGatewayConfig317(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('gateway config must be a YAML mapping')
  if ('dev' in value) throw new Error('dev: was removed; gateway requires Postgres store')
  const listen = value.listen ?? {}
  const host = listen.host ?? '0.0.0.0'
  const port = positiveInteger(listen.port, 8080, 'listen.port')
  if (!LOOPBACK.has(host) && !listen.public_url) {
    throw new Error('listen.public_url is required for externally reachable gateway')
  }
  const public_url = listen.public_url && safeHttps(listen.public_url, 'listen.public_url')
  const store = value.store
  if (!store || typeof store !== 'object') throw new Error('gateway store is required')
  const postgres_url = safeStore(store.postgres_url)
  const session = value.session
  const secrets = Array.isArray(session?.jwt_secret)
    ? session.jwt_secret : [session?.jwt_secret]
  if (!secrets.length || secrets.some(x =>
    typeof x !== 'string' || Buffer.byteLength(x) < 32)) {
    throw new Error('session.jwt_secret requires one or more secrets of at least 32 bytes')
  }
  const cri = value.cri ? validateCriConfig317(value.cri) : undefined
  if (!value.oidc && !cri?.enabled) {
    throw new Error('oidc is required unless cri.enabled is true')
  }
  if (value.oidc) {
    nonempty(value.oidc.client_id, 'oidc.client_id')
    safeHttps(value.oidc.issuer, 'oidc.issuer')
  }
  if (!Array.isArray(value.upstreams) || !value.upstreams.length) {
    throw new Error('gateway needs at least one upstream')
  }
  const names = new Set()
  const upstreams = value.upstreams.map(x => validateUpstream(x, names))
  for (const mapping of value.models ?? []) {
    for (const name of Object.keys(mapping.upstream_model ?? {})) {
      if (!names.has(name)) throw new Error('model references unknown upstream ' + name)
    }
  }
  const telemetry = value.telemetry ?? { forward_to: [] }
  if (telemetry.forward_to !== undefined && !Array.isArray(telemetry.forward_to)) {
    throw new Error('telemetry.forward_to must be a list')
  }
  for (const dest of telemetry.forward_to ?? []) safeHttps(dest.url, 'telemetry.forward_to.url')
  return {
    ...value,
    listen: { ...listen, host, port, public_url },
    store: { max_connections: 5, connect_timeout_seconds: 5, readiness_grace_seconds: 0,
      ...store, postgres_url },
    session: { ...session, jwt_secret: secrets, ttl_hours: session.ttl_hours ?? 1 },
    upstreams,
    ...(value.admin && {admin:validateGatewayAdmin317(value.admin)}),
    ...(cri && {cri}),
    models: value.models ?? [],
    telemetry,
    limits: { max_request_bytes: 33554432, ...(value.limits ?? {}) },
  }
}

export async function readGatewayConfig317(file, parseYaml) {
  const content = await readFile(file, 'utf8')
  const raw = parseYaml(content)
  const interpolate = async item => {
    if (typeof item === 'string') {
      const match = /^\$\{file:(.+)\}$/.exec(item)
      if (match) {
        if (!match[1].startsWith('/') && !/^[A-Za-z]:[\\/]/.test(match[1])) {
          throw new Error('gateway secret file must have an absolute path')
        }
        return (await readFile(match[1], 'utf8')).trim()
      }
      return item.replace(/\$\{(\w+)\}/g, (all, key) => {
        if (process.env[key] === undefined) throw new Error('undefined gateway config variable: ' + key)
        return process.env[key]
      })
    }
    if (Array.isArray(item)) return Promise.all(item.map(interpolate))
    if (item && typeof item === 'object') {
      return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, val]) => [key, await interpolate(val)])))
    }
    return item
  }
  return validateGatewayConfig317(await interpolate(raw))
}
