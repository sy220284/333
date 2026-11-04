/**
 * Claude Code 2.1.317 enterprise managed-settings endpoint.
 *
 * Policy evaluation and checksum formatting follow the original native
 * gateway's /managed/settings contract. Every deny/ask list is merged
 * without dropping an earlier matched policy's restrictions.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const UNION_KEYS = new Set([
  'disabledMcpjsonServers','deniedMcpServers','blockedMarketplaces','deniedModels',
])
const NESTED_KEYS = new Set(['env','modelOverrides','skillOverrides'])
const LAYERED_UNSAFE = new Set([
  'apiKeyHelper', 'awsCredentialExport', 'awsAuthRefresh', 'otelHeadersHelper',
  'disableAllHooks','allowedHttpHookUrls','httpHookAllowedEnvVars',
])
const forbidden = new Set(['__proto__','constructor','prototype'])
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function validatePlain(value, label) {
  if (!isRecord(value)) throw new Error(label + ' must be an object')
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(label + ': forbidden field ' + key)
    if (Array.isArray(child)) {
      for (const [i, item] of child.entries()) {
        if (isRecord(item)) validatePlain(item, label + '.' + key + '[' + i + ']')
      }
    } else if (isRecord(child)) validatePlain(child, label + '.' + key)
  }
  return value
}
function unique(items) {
  const seen = new Set()
  return items.filter(item => {
    const id = JSON.stringify(canonical(item))
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key])]),
    )
  }
  return value
}
function mergeSettings(base, next) {
  const merged = { ...base, ...next }
  for (const key of NESTED_KEYS) {
    if (isRecord(base[key]) || isRecord(next[key])) {
      merged[key] = { ...(base[key] ?? {}), ...(next[key] ?? {}) }
    }
  }
  for (const key of UNION_KEYS) {
    if (Array.isArray(base[key]) || Array.isArray(next[key])) {
      merged[key] = unique([...(base[key] ?? []), ...(next[key] ?? [])])
    }
  }
  for (const field of ['permissions','hooks']) {
    if (!isRecord(base[field]) && !isRecord(next[field])) continue
    const a = isRecord(base[field]) ? base[field] : {}
    const b = isRecord(next[field]) ? next[field] : {}
    const layer = { ...a, ...b }
    const keys = field === 'permissions'
      ? ['deny','ask']
      : [...new Set([...Object.keys(a), ...Object.keys(b)])]
    for (const key of keys) {
      if (Array.isArray(a[key]) || Array.isArray(b[key])) {
        layer[key] = unique([...(a[key] ?? []), ...(b[key] ?? [])])
      }
    }
    merged[field] = layer
  }
  return merged
}
function matches(rule, identity) {
  const groups = rule?.groups
  if (groups !== undefined) {
    if (!Array.isArray(groups) || groups.length === 0 ||
      groups.some(g => typeof g !== 'string' || !g.trim())) {
      throw new Error('managed.policy.match.groups must contain group names')
    }
    if (!Array.isArray(identity.groups) ||
      !groups.some(g => identity.groups.includes(g))) return false
  }
  const domain = rule?.email_domain
  if (domain !== undefined) {
    if (typeof domain !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain) ||
      domain.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
      throw new Error('managed.policy.match.email_domain must be one bare domain')
    }
    const email = typeof identity.email === 'string' ? identity.email.toLowerCase() : ''
    if (!email.endsWith('@' + domain.trim().replace(/^@/,'').toLowerCase())) return false
  }
  return true
}
function policySettings(policy) {
  if (!isRecord(policy)) throw new Error('managed.policy must be an object')
  const settings = policy.code ?? policy.cli ?? policy.settings ?? {}
  return validatePlain(settings, 'managed.policy settings')
}
function assertLayeredSafe(settings) {
  for (const key of LAYERED_UNSAFE) {
    if (settings[key] !== undefined) throw new Error('managed layered policy cannot use ' + key)
  }
  for (const key of ['deny','ask']) {
    for (const rule of settings.permissions?.[key] ?? []) {
      if (typeof rule === 'string' && rule.trimStart().startsWith('!')) {
        throw new Error('managed layered policy cannot remove an earlier permission rule')
      }
    }
  }
}

/**
 * Loads static managed policies at service startup; file failures must abort
 * startup, not erase an existing mandatory managed policy.
 */
export async function createGatewayManagedSettings317(managed) {
  if (!managed) return null
  if (managed.policies !== undefined) {
    if (!Array.isArray(managed.policies)) throw new Error('managed.policies must be an array')
    const usingCode = managed.policies.some(p => p?.code !== undefined)
    const policies = managed.policies.map(policy => {
      if (usingCode && (policy?.cli !== undefined || policy?.settings !== undefined)) {
        throw new Error('managed code policies must not mix with cli/settings')
      }
      const settings = policySettings(policy)
      const match = policy.match ?? {}
      validatePlain(match, 'managed.policy.match')
      if (managed.policy_mode === 'layered') assertLayeredSafe(settings)
      return { match, settings }
    })
    if (managed.policy_mode !== undefined &&
      !['layered','first_match'].includes(managed.policy_mode)) {
      throw new Error('Invalid managed policy_mode')
    }
    return { mode: managed.policy_mode ?? 'first_match', policies }
  }
  if (managed.settings !== undefined) {
    if (typeof managed.settings !== 'string') {
      throw new Error('managed.settings must be a file path')
    }
    const raw = await readFile(managed.settings, 'utf8')
    if (Buffer.byteLength(raw) > 1048576) throw new Error('managed settings exceeded 1 MiB')
    return { mode:'first_match', policies:[{
      match: {}, settings: validatePlain(JSON.parse(raw), 'managed settings'),
    }] }
  }
  return null
}
export function responseForManagedSettings317(request, identity, policySet) {
  const headers = {
    'cache-control':'no-store',
    'x-cc-gateway-version':'2.1.317',
  }
  if (!policySet) return new Response(null,{status:404,headers})
  const policies = policySet.policies.filter(p => matches(p.match,identity))
  if (!policies.length) return new Response(null,{status:404,headers})
  const selected = policySet.mode === 'layered'
    ? policies.reduce((acc,p) => mergeSettings(acc,p.settings), {})
    : (() => {
        const first = policies[0]
        const base = policySet.policies.find(p =>
          !Object.keys(p.match).length)
        return base && base !== first
          ? mergeSettings(base.settings,first.settings) : first.settings
      })()
  const json = JSON.stringify(canonical(selected))
  const checksum = 'sha256:' + createHash('sha256').update(json).digest('hex')
  const tag = '"' + checksum + '"'
  const responseHeaders = { ...headers, etag:tag }
  if (request.headers.get('if-none-match') === tag) {
    return new Response(null,{status:304,headers:responseHeaders})
  }
  return Response.json({ uuid:checksum, checksum, settings:selected },{
    status:200, headers:responseHeaders,
  })
}
