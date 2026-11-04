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
  const provider = item.provider
  const types = new Set([
    'anthropic', 'bedrock', 'mantle', 'anthropicAws',
    'anthropicGoogleCloud', 'vertex', 'foundry',
  ])
  if (!types.has(provider)) throw new Error('Unsupported 2.1.317 upstream provider: ' + provider)
  const auth = item.auth ?? {}
  if (!auth || typeof auth !== 'object' || Array.isArray(auth))
    throw new Error('upstream.auth must be a mapping')
  const validCredential = value => typeof value === 'string' && value.length > 0
  const awsAccess = validCredential(auth.aws_access_key_id)
  const awsSecret = validCredential(auth.aws_secret_access_key)
  if (provider === 'anthropic') {
    const direct = validCredential(auth.api_key) || validCredential(auth.oauth_token)
    const wif = validCredential(auth.federation_rule_id) &&
      validCredential(auth.organization_id) && validCredential(auth.identity_token_file)
    if (!direct && !wif)
      throw new Error('Anthropic upstream requires API key, OAuth token or complete OIDC federation credentials')
  } else if (provider === 'foundry') {
    nonempty(item.resource,'foundry.resource')
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}[A-Za-z0-9]$/.test(item.resource))
      throw new Error('foundry.resource must be 2–64 letters, digits or hyphens')
    if (!validCredential(auth.api_key) && auth.use_azure_ad !== true)
      throw new Error('foundry auth requires api_key or use_azure_ad: true')
  } else {
    if (provider === 'bedrock' || provider === 'mantle' || provider === 'anthropicAws') {
      nonempty(item.region, 'upstream.region')
      if (provider !== 'bedrock' && !/^[a-z0-9-]+$/.test(item.region))
        throw new Error('AWS region must contain lowercase letters, digits and hyphens')
      if (awsAccess !== awsSecret)
        throw new Error('AWS access key and secret must be configured together')
      if (auth.aws_session_token && !awsAccess)
        throw new Error('AWS session token requires access key and secret')
      if (provider === 'bedrock' && item.assume_role && auth.aws_bearer_token)
        throw new Error('bedrock assume_role requires SigV4 credentials')
    }
    if (provider === 'mantle' && (!Array.isArray(item.models) || item.models.length === 0))
      throw new Error('mantle upstream requires a models list')
    if (provider === 'anthropicAws')
      nonempty(item.workspace_id,'anthropicAws.workspace_id')
    if (provider === 'anthropicGoogleCloud') {
      nonempty(item.project_id,'anthropicGoogleCloud.project_id')
      nonempty(item.workspace_id,'anthropicGoogleCloud.workspace_id')
      item = {...item, location: item.location ?? 'global'}
    }
    if (provider === 'vertex') {
      nonempty(item.project_id,'vertex.project_id')
      nonempty(item.region,'vertex.region')
    }
  }
  const base_url = item.base_url !== undefined ? safeHttps(item.base_url, 'upstream.base_url')
    : provider === 'anthropic' ? 'https://api.anthropic.com' : undefined
  for (const field of ['models','groups']) {
    if (item[field] !== undefined && (!Array.isArray(item[field]) || !item[field].length ||
      item[field].some(x => typeof x !== 'string' || !x))) {
      throw new Error('upstream.' + field + ' must be a nonempty list of names')
    }
  }
  const headers = item.headers ?? {}
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('upstream.headers must be a mapping')
  const reserved = /^(authorization|proxy-authorization|host|connection|content-length|content-encoding|transfer-encoding|x-api-key|api-key|x-litellm-end-user-id|anthropic-|x-stainless-|x-claude-gateway-|x-goog-|x-amz-|x-amzn-)/i
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
  const rate_limits = {}
  for (const [name, defaults] of Object.entries({
    device_authorization:{max:30,window_seconds:600},
    device_verify:{max:10,window_seconds:600},
  })) {
    const settings = value.rate_limits?.[name] ?? {}
    for (const [field, fallback] of Object.entries(defaults)) {
      const selected = settings[field] ?? fallback
      if (!Number.isSafeInteger(selected) || selected < 1)
        throw new Error('rate_limits.' + name + '.' + field + ' must be positive integer')
      rate_limits[name] ??= {}
      rate_limits[name][field] = selected
    }
  }
  return {
    ...value,
    rate_limits,
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
