/**
 * Enterprise auth/telemetry gateway lifecycle.
 * All ingress is authenticated before inference, policy and telemetry work.
 * PostgreSQL is required at startup and remains the durable authority for
 * device approvals, token renewal, revocations and audit.
 */
import { readFile } from 'node:fs/promises'
import { BlockList, isIP } from 'node:net'
import { randomUUID } from 'node:crypto'
import { readGatewayConfig317 } from './gatewayConfig317.mjs'
import { createOidcProvider317, verifyGatewaySession317 } from './gatewayAuth317.mjs'
import { createGatewayDeviceFlow317 } from './gatewayDevice317.mjs'
import { openGatewayStore317 } from './gatewayStore317.mjs'
import { createGatewayManagedSettings317, responseForManagedSettings317 } from './gatewayManaged317.mjs'
import {
  forwardGatewayInference317, forwardGatewayTelemetry317, listGatewayModels317,
} from './gatewayForward317.mjs'

const secureHeaders = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
})
const error = (status, type, message, requestId) =>
  Response.json({ type: 'error', error: { type, message } }, {
    status, headers: {
      'x-request-id': requestId, 'cache-control':'no-store',
    },
  })
function blockList(cidrs) {
  const blocked = new BlockList()
  for (const entry of cidrs ?? []) {
    const [address,prefix] = entry.split('/')
    const type = isIP(address)
    if (!type) throw new Error('Invalid CIDR: ' + entry)
    if (prefix !== undefined) {
      const width = Number(prefix)
      if (!Number.isInteger(width) || width < 0 || width > (type === 4 ? 32 : 128)) {
        throw new Error('Invalid CIDR mask: ' + entry)
      }
      blocked.addSubnet(address, width, type === 4 ? 'ipv4' : 'ipv6')
    } else {
      blocked.addAddress(address, type === 4 ? 'ipv4' : 'ipv6')
    }
  }
  return blocked
}
function allowedAddress(remote, allow, deny, allowConfigured) {
  const version = remote ? isIP(remote) : 0
  if (!version) return false
  const type = version === 4 ? 'ipv4' : 'ipv6'
  if (deny.check(remote, type)) return false
  return !allowConfigured || allow.check(remote, type)
}
function bearer(request) {
  const value = request.headers.get('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7) : null
}
function makeResponseSecure(response, tls) {
  const headers = new Headers(response.headers)
  for (const [name,value] of Object.entries(secureHeaders)) {
    if (!headers.has(name)) headers.set(name,value)
  }
  if (tls) headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  return new Response(response.body, {
    status: response.status, statusText:response.statusText, headers,
  })
}
async function configFromFile(path) {
  // Reuse the repo's existing YAML parser, preserving its anchors,
  // structured errors, booleans and nested maps.
  const { parseYaml } = await import('../../utils/yaml.js')
  return readGatewayConfig317(path, parseYaml)
}

export async function createGatewayService317(config, deps = {}) {
  if (typeof Bun === 'undefined' || typeof Bun.serve !== 'function') {
    throw new Error('claude gateway requires the native Bun runtime')
  }
  if (config.cri?.enabled && !config.oidc) {
    throw new Error('CRI JWT admission requires pinned Anthropic issuer verification')
  }
  if (config.admin) {
    throw new Error('Gateway admin spending limits require the durable spend policy engine')
  }
  // Validate and load managed policy before binding the listening socket.
  const managed = await createGatewayManagedSettings317(config.managed)
  const store = deps.store ?? await openGatewayStore317(config.store)
  let server
  try {
    const oidc = deps.oidc ?? (config.oidc ? await createOidcProvider317(config.oidc) : null)
    const publicUrl = config.listen.public_url ??
      'http://' + config.listen.host + ':' + config.listen.port
    const device = createGatewayDeviceFlow317({
      publicUrl, oidc, store, config,
    })
    const allow = blockList(config.access_control?.allow_cidrs)
    const deny = blockList(config.access_control?.deny_cidrs)
    const trusted = blockList(config.listen.trusted_proxies)
    const start = Date.now()
    const handle = async (request, service) => {
      const requestId = randomUUID()
      const url = new URL(request.url)
      const remote = service.requestIP?.(request)?.address ?? null
      let clientIp = remote
      const type = isIP(remote) === 4 ? 'ipv4' : 'ipv6'
      if (remote && isIP(remote) && trusted.check(remote, type)) {
        const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        if (forwarded && isIP(forwarded)) clientIp = forwarded
      }
      if (!allowedAddress(clientIp, allow, deny, (config.access_control?.allow_cidrs?.length ?? 0) > 0)) {
        return error(403, 'permission_error', 'access forbidden by IP policy', requestId)
      }
      if (url.pathname.length > (config.limits.max_url_length ?? 8192)) {
        return error(414, 'invalid_request_error', 'URL is too long', requestId)
      }
      const authFree = {
        'GET /.well-known/oauth-authorization-server': () => device.publicDiscovery(),
        'GET /healthz': () => Response.json({ status:'ok', uptime_seconds: Math.floor((Date.now()-start)/1000) }),
        'GET /device': () => device.verificationPage(request),
        'POST /device': () => device.verifyDevice(request, clientIp),
        'GET /oauth/callback': () => device.callback(request),
        'POST /oauth/device_authorization': () => device.deviceAuthorization(request, clientIp),
        'POST /oauth/token': () => device.token(request),
        'POST /oauth/revoke': () => device.revoke(request),
      }
      const route = request.method + ' ' + url.pathname
      try {
        if (authFree[route]) return await authFree[route]()
        const token = bearer(request)
        const identity = token && verifyGatewaySession317(
          token, config.session.jwt_secret, publicUrl)
        if (!identity || await store.isRevoked(token)) {
          return error(401, 'authentication_error', 'invalid token', requestId)
        }
        const context = {
          config, identity, store, audit: (name, sub, id, meta) =>
            store.audit(name, sub, id, meta),
        }
        if (url.pathname === '/managed/settings' && request.method === 'GET') {
          return responseForManagedSettings317(request, identity, managed)
        }
        if (url.pathname === '/v1/models' && request.method === 'GET') {
          return listGatewayModels317(config, identity)
        }
        if (['/v1/messages','/v1/messages/count_tokens'].includes(url.pathname)
          && request.method === 'POST') {
          return forwardGatewayInference317(request, context)
        }
        if (['/v1/metrics','/v1/traces','/v1/logs'].includes(url.pathname)
          && request.method === 'POST') {
          return forwardGatewayTelemetry317(request, context)
        }
        return error(404, 'not_found_error', 'not found', requestId)
      } catch (cause) {
        await store.audit('gateway.request_error', null, requestId, {
          path:url.pathname, reason:String(cause),
        })
        return error(500,'api_error','gateway request failed',requestId)
      }
    }
    const tls = config.listen.tls && {
      cert: await readFile(config.listen.tls.cert, 'utf8'),
      key: await readFile(config.listen.tls.key, 'utf8'),
    }
    server = (deps.serve ?? Bun.serve)({
      hostname: config.listen.host, port: config.listen.port,
      ...(tls && { tls }),
      async fetch(request, service) {
        const response = await handle(request, service)
        return makeResponseSecure(response, Boolean(tls))
      },
      idleTimeout: 255,
    })
    let closed = false
    return {
      server, config, async close() {
        if (closed) return
        closed = true
        await server.stop(true)
        await store.close()
      },
    }
  } catch (error) {
    if (server) await server.stop(true)
    if (!deps.store) await store.close()
    throw error
  }
}

export async function runEnterpriseGateway317(configPath) {
  if (!configPath) throw new Error('gateway requires --config <path>')
  const config = await configFromFile(configPath)
  const app = await createGatewayService317(config)
  process.stderr.write(
    'Claude Code enterprise gateway listening on ' +
    config.listen.host + ':' + config.listen.port + '\n',
  )
  const stop = async () => {
    process.off('SIGTERM', stop)
    process.off('SIGINT', stop)
    await app.close()
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  return app
}
