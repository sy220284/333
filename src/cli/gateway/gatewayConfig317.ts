/**
 * Enterprise gateway 2.1.317 configuration contract.
 * No permissive defaults for authentication, database or public exposure.
 */
import { readFile } from 'node:fs/promises'
import { validateGatewayAdmin317 } from './gatewayAdmin317.ts'
import { validateCriConfig317 } from './gatewayCri317.ts'
import type { GatewayOidcConfig317 } from './gatewayAuth317.ts'

type GatewayProvider317 = 'anthropic' | 'bedrock' | 'mantle' | 'anthropicAws' |
  'anthropicGoogleCloud' | 'vertex' | 'foundry'
export type GatewayUpstream317 = Record<string, unknown> & {
  name: string
  provider: GatewayProvider317
  base_url?: string
  headers: Record<string, string>
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(name + ' must be a mapping')
  return value
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const nonempty = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(name + ' must be a nonempty string')
  return value
}
const positiveInteger = (value: unknown, fallback: number, name: string): number => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) throw new Error(name + ' must be a positive integer')
  return value
}
const safeHttps = (value: unknown, name: string): string => {
  const url = new URL(nonempty(value, name))
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
    throw new Error(name + ' requires https (or explicit loopback)')
  }
  if (url.username || url.password || url.hash) throw new Error(name + ' cannot contain credentials or a fragment')
  return url.toString().replace(/\/$/, '')
}
const safeStore = (value: unknown): string => {
  const connection = nonempty(value, 'store.postgres_url')
  const url = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('store.postgres_url must use postgres://host/database')
  }
  if (url.hostname.includes(',')) throw new Error('Postgres multi-host URLs are not supported')
  return connection
}
function validateUpstream(item: unknown, names: Set<string>): GatewayUpstream317 {
  if (!isRecord(item)) throw new Error('upstream must be a map')
  const name = nonempty(item.name, 'upstream.name')
  if (names.has(name)) throw new Error('Duplicate upstream: ' + name)
  names.add(name)
  const provider = item.provider
  const types = new Set([
    'anthropic', 'bedrock', 'mantle', 'anthropicAws',
    'anthropicGoogleCloud', 'vertex', 'foundry',
  ])
  if (typeof provider !== 'string' || !types.has(provider)) throw new Error('Unsupported 2.1.317 upstream provider: ' + provider)
  const auth = item.auth ?? {}
  if (!isRecord(auth)) throw new Error('upstream.auth must be a mapping')
  const validCredential = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  const awsAccess = validCredential(auth.aws_access_key_id)
  const awsSecret = validCredential(auth.aws_secret_access_key)
  if (provider === 'anthropic') {
    const direct = validCredential(auth.api_key) || validCredential(auth.oauth_token)
    const wif = validCredential(auth.federation_rule_id) &&
      validCredential(auth.organization_id) && validCredential(auth.identity_token_file)
    if (!direct && !wif)
      throw new Error('Anthropic upstream requires API key, OAuth token or complete OIDC federation credentials')
  } else if (provider === 'foundry') {
    const resource = nonempty(item.resource,'foundry.resource')
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}[A-Za-z0-9]$/.test(resource))
      throw new Error('foundry.resource must be 2–64 letters, digits or hyphens')
    if (!validCredential(auth.api_key) && auth.use_azure_ad !== true)
      throw new Error('foundry auth requires api_key or use_azure_ad: true')
  } else {
    if (provider === 'bedrock' || provider === 'mantle' || provider === 'anthropicAws') {
      const region = nonempty(item.region, 'upstream.region')
      if (provider !== 'bedrock' && !/^[a-z0-9-]+$/.test(region))
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
      // The normalized global default is applied to the returned copy.
    }
    if (provider === 'vertex') {
      nonempty(item.project_id,'vertex.project_id')
      nonempty(item.region,'vertex.region')
    }
  }
  const base_url = item.base_url !== undefined ? safeHttps(item.base_url, 'upstream.base_url')
    : provider === 'anthropic' ? 'https://api.anthropic.com' : undefined
  for (const field of ['models','groups']) {
    const list = item[field]
    if (list !== undefined && (!Array.isArray(list) || !list.length ||
      list.some((x: unknown) => typeof x !== 'string' || !x))) {
      throw new Error('upstream.' + field + ' must be a nonempty list of names')
    }
  }
  const headers = item.headers ?? {}
  if (!isRecord(headers)) throw new Error('upstream.headers must be a mapping')
  const reserved = /^(authorization|proxy-authorization|host|connection|content-length|content-encoding|transfer-encoding|x-api-key|api-key|x-litellm-end-user-id|anthropic-|x-stainless-|x-claude-gateway-|x-goog-|x-amz-|x-amzn-)/i
  for (const [key, value] of Object.entries(headers)) {
    if (reserved.test(key) || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) {
      throw new Error('upstream.headers contains forbidden header ' + key)
    }
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error('invalid upstream header ' + key)
  }
  return { ...item,
    ...(provider === 'anthropicGoogleCloud' && {location: item.location ?? 'global'}),
    name, provider: provider as GatewayProvider317,
    base_url, headers: headers as Record<string, string> }
}
export function validateGatewayConfig317(value: unknown) {
  if (!isRecord(value)) throw new Error('gateway config must be a YAML mapping')
  if ('dev' in value) throw new Error('dev: was removed; gateway requires Postgres store')
  const listen = requireRecord(value.listen ?? {}, 'listen')
  const host = nonempty(listen.host ?? '0.0.0.0', 'listen.host')
  const port = positiveInteger(listen.port, 8080, 'listen.port')
  if (!LOOPBACK.has(host) && !listen.public_url) {
    throw new Error('listen.public_url is required for externally reachable gateway')
  }
  const public_url = listen.public_url && safeHttps(listen.public_url, 'listen.public_url')
  const store = value.store
  if (!isRecord(store)) throw new Error('gateway store is required')
  const postgres_url = safeStore(store.postgres_url)
  const session = requireRecord(value.session, 'session')
  const secrets = Array.isArray(session?.jwt_secret)
    ? session.jwt_secret : [session?.jwt_secret]
  if (!secrets.length || secrets.some((x: unknown) =>
    typeof x !== 'string' || Buffer.byteLength(x) < 32)) {
    throw new Error('session.jwt_secret requires one or more secrets of at least 32 bytes')
  }
  const cri = value.cri ? validateCriConfig317(value.cri) : undefined
  if (!value.oidc && !cri?.enabled) {
    throw new Error('oidc is required unless cri.enabled is true')
  }
  let oidc: GatewayOidcConfig317 | undefined
  if (value.oidc) {
    const rawOidc = requireRecord(value.oidc, 'oidc')
    const client_id = nonempty(rawOidc.client_id, 'oidc.client_id')
    const issuer = nonempty(rawOidc.issuer, 'oidc.issuer')
    safeHttps(issuer, 'oidc.issuer')
    const client_secret = rawOidc.client_secret
    if (client_secret !== undefined && typeof client_secret !== 'string')
      throw new Error('oidc.client_secret must be a string')
    const scopes = rawOidc.scopes
    if (scopes !== undefined && (!Array.isArray(scopes) ||
      scopes.some((scope: unknown) => typeof scope !== 'string')))
      throw new Error('oidc.scopes must contain strings')
    oidc = { ...rawOidc, issuer, client_id,
      client_secret, scopes: scopes as string[] | undefined }
  }
  if (!Array.isArray(value.upstreams) || !value.upstreams.length) {
    throw new Error('gateway needs at least one upstream')
  }
  const names = new Set<string>()
  const upstreams = value.upstreams.map((x: unknown) => validateUpstream(x, names))
  const models = value.models === undefined ? [] : value.models
  if (!Array.isArray(models)) throw new Error('models must be a list')
  for (const mapping of models) {
    const config = requireRecord(mapping, 'model')
    const perUpstream = requireRecord(config.upstream_model ?? {}, 'model.upstream_model')
    for (const name of Object.keys(perUpstream)) {
      if (!names.has(name)) throw new Error('model references unknown upstream ' + name)
    }
  }
  const telemetry = requireRecord(value.telemetry ?? { forward_to: [] }, 'telemetry')
  if (telemetry.forward_to !== undefined && !Array.isArray(telemetry.forward_to)) {
    throw new Error('telemetry.forward_to must be a list')
  }
  for (const dest of (telemetry.forward_to ?? []) as unknown[]) {
    safeHttps(requireRecord(dest, 'telemetry destination').url, 'telemetry.forward_to.url')
  }
  const rate_limits: Record<string, Record<string, number>> = {}
  const sourceLimits = requireRecord(value.rate_limits ?? {}, 'rate_limits')
  for (const [name, defaults] of Object.entries({
    device_authorization:{max:30,window_seconds:600},
    device_verify:{max:10,window_seconds:600},
  })) {
    const settings = requireRecord(sourceLimits[name] ?? {}, 'rate_limits.' + name)
    for (const [field, fallback] of Object.entries(defaults)) {
      const selected = settings[field] ?? fallback
      if (typeof selected !== 'number' || !Number.isSafeInteger(selected) || selected < 1)
        throw new Error('rate_limits.' + name + '.' + field + ' must be positive integer')
      const group = rate_limits[name] ??= {}
      group[field] = selected
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
    ...(oidc && {oidc}),
    ...(value.admin && {admin:validateGatewayAdmin317(value.admin)}),
    ...(cri && {cri}),
    models,
    telemetry,
    limits: { max_request_bytes: 33554432, ...requireRecord(value.limits ?? {}, 'limits') }, 
  }
}

export type GatewayConfig317 = ReturnType<typeof validateGatewayConfig317>

export async function readGatewayConfig317(
  file: string, parseYaml: (yaml: string) => unknown,
): Promise<GatewayConfig317> {
  const content = await readFile(file, 'utf8')
  const raw = parseYaml(content)
  const interpolate = async (item: unknown): Promise<unknown> => {
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
    if (isRecord(item)) {
      return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, val]) => [key, await interpolate(val)])))
    }
    return item
  }
  return validateGatewayConfig317(await interpolate(raw))
}
