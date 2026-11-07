/**
 * Safely forward Claude API JSON/SSE inference to configured providers.
 * Client authentication never crosses the trust boundary; upstream credentials
 * are chosen from validated server config, and only allowlisted metadata is sent.
 */
import { randomUUID } from 'node:crypto'
import { meterGatewayResponse317 } from './gatewaySpendMeter317.ts'
import { classifyCriCapability317 } from './gatewayCri317.ts'
import { forwardGatewaySdk317 } from './gatewayProviders317.ts'

const FORWARD = new Set([
  'anthropic-version','anthropic-beta','content-type','accept',
  'x-stainless-os','x-stainless-arch','x-stainless-runtime',
  'x-stainless-runtime-version','x-stainless-package-version',
  'x-stainless-lang','x-stainless-retry-count','x-request-id',
])
const RESPONSE = new Set([
  'content-type','cache-control','anthropic-ratelimit-requests-limit',
  'anthropic-ratelimit-requests-remaining',
  'anthropic-ratelimit-requests-reset',
  'anthropic-ratelimit-tokens-limit','anthropic-ratelimit-tokens-remaining',
  'anthropic-ratelimit-tokens-reset','retry-after','request-id',
  'x-request-id','anthropic-organization-id','anthropic-version',
])
export async function readBoundedGatewayBody317(request, limit) : Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) return new Uint8Array()
  const data = [], reader = request.body.getReader()
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > limit) throw new Error('gateway request body is larger than configured limit')
      data.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const merged = new Uint8Array(bytes)
  let at = 0
  for (const chunk of data) { merged.set(chunk, at); at += chunk.byteLength }
  return merged
}

function chooseUpstream(config, identity, model) {
  const groups = identity.groups ?? []
  const permitted = config.upstreams.filter(up =>
    !up.groups?.length || up.groups.some(group => groups.includes(group)))
  if (!permitted.length) return null
  const mapping = config.models.find(m => m.id === model)
  const preferred = mapping && permitted.find(up => mapping.upstream_model?.[up.name])
  if (preferred) {
    return { upstream: preferred, model: mapping.upstream_model[preferred.name] }
  }
  const available = permitted.find(up => !up.models?.length || up.models.includes(model))
  if (!available) return null
  return { upstream: available, model }
}

function proxyError(status, type, message, requestId) {
  return Response.json({ type: 'error', error: { type, message } }, {
    status, headers: {
      'content-type':'application/json', 'x-request-id': requestId,
      'cache-control':'no-store',
    },
  })
}

function pickHeaders(request, up, requestId) {
  const headers = new Headers()
  for (const [key, value] of request.headers) {
    if (FORWARD.has(key.toLowerCase())) headers.set(key, value)
  }
  for (const [name, value] of Object.entries(up.headers ?? {})) headers.set(name, String(value))
  if (up.auth?.api_key) headers.set('x-api-key', up.auth.api_key)
  else if (up.auth?.oauth_token) headers.set('authorization', 'Bearer ' + up.auth.oauth_token)
  headers.set('x-request-id', requestId)
  if (!headers.has('anthropic-version')) headers.set('anthropic-version','2023-06-01')
  return headers
}

export async function forwardGatewayInference317(request, context) : Promise<Response> {
  const { config, identity, audit } = context
  const requestId = randomUUID()
  const path = new URL(request.url).pathname
  if (!['/v1/messages','/v1/messages/count_tokens'].includes(path)) {
    return proxyError(404, 'not_found_error', 'unsupported inference endpoint', requestId)
  }
  const limit = config.limits.max_request_bytes
  const length = request.headers.get('content-length')
  if (length && Number(length) > limit) {
    return proxyError(413, 'invalid_request_error', 'request too large', requestId)
  }
  let data
  try { data = await readBoundedGatewayBody317(request, limit) }
  catch (error) { return proxyError(413, 'invalid_request_error', error.message, requestId) }
  let payload
  try { payload = JSON.parse(new TextDecoder().decode(data)) }
  catch { return proxyError(400, 'invalid_request_error', 'invalid JSON', requestId) }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return proxyError(400, 'invalid_request_error', 'request body must be a JSON object', requestId)
  }
  if (typeof payload.model !== 'string' || !payload.model) {
    return proxyError(400, 'invalid_request_error', 'model is required', requestId)
  }
  const clientModel = payload.model
  const chosen = chooseUpstream(config, identity, payload.model)
  if (!chosen) return proxyError(403, 'permission_error', 'model is not available to this identity', requestId)
  if (chosen.model !== payload.model) {
    payload.model = chosen.model
    data = new TextEncoder().encode(JSON.stringify(payload))
  }
  const upstream = chosen.upstream
  const endpoint = upstream.provider === 'anthropic'
    ? new URL(path, upstream.base_url.endsWith('/')
      ? upstream.base_url : upstream.base_url + '/')
    : undefined
  let response
  const start = performance.now()
  // The TTFB deadline expires once response headers arrive; SSE may run longer.
  const upstreamAbort = new AbortController()
  const ttfbTimer = setTimeout(
    () => upstreamAbort.abort(new Error('upstream time to first byte exceeded')),
    config.timeouts?.upstream_ttfb_ms ?? 120000,
  )
  try {
    if (upstream.provider !== 'anthropic') {
      const meta = Object.fromEntries([...request.headers]
        .filter(([key])=>key.toLowerCase().startsWith('x-stainless-')))
      response = await forwardGatewaySdk317(upstream, payload, path, {
        requestId, requestedModel: clientModel,
        signal: upstreamAbort.signal,
        timeoutMs: config.timeouts?.upstream_ttfb_ms ?? 120000,
        extraHeaders: meta,
        providerFactory: context.providerFactory,
      })
    } else {
      response = await fetch(endpoint, {
      method:'POST',
      headers: pickHeaders(request, upstream, requestId),
      body: data,
      redirect: 'manual',
      signal: upstreamAbort.signal,
      })
    }
  } catch (error) {
    await audit('inference.failure', identity.sub, requestId, {
      model: payload.model, upstream: upstream.name, elapsed_ms: Math.round(performance.now()-start),
      message: String(error),
    })
    return proxyError(502, 'api_error', 'upstream connection failed', requestId)
  } finally {
    clearTimeout(ttfbTimer)
  }
  const responseHeaders = new Headers()
  for (const [name,value] of response.headers) {
    if (RESPONSE.has(name.toLowerCase()) && !(identity.cri &&
      (name.toLowerCase()==='request-id'||
       name.toLowerCase()==='anthropic-organization-id'||
       name.toLowerCase().startsWith('anthropic-ratelimit-')))) {
      responseHeaders.set(name,value)
    }
  }
  responseHeaders.set('x-request-id', identity.cri ? requestId :
    response.headers.get('request-id') ?? requestId)
  await audit('inference', identity.sub, requestId, {
    model: payload.model, upstream: upstream.name, status:response.status,
    elapsed_ms: Math.round(performance.now()-start),
  })
  if (response.status >= 300 && response.status < 400) {
    response.body?.cancel()
    return proxyError(502, 'api_error', 'upstream redirect refused', requestId)
  }
  if (identity.cri && response.status >= 400) {
    // Keep error status and capability-fallback token while removing all
    // upstream identity details and raw proxy error pages.
    let diagnostic=''
    if (response.body) {
      const reader=response.body.getReader()
      let bytes=0
      try {
        while (bytes<65536) {
          const {done,value}=await reader.read()
          if (done) break
          const take=Math.min(value.byteLength,65536-bytes)
          diagnostic+=new TextDecoder().decode(value.subarray(0,take))
          bytes+=take
        }
      } finally {
        await reader.cancel().catch(()=>{})
        reader.releaseLock()
      }
    }
    try { diagnostic=JSON.parse(diagnostic)?.error?.message??diagnostic }
    catch { /* Non-JSON bodies are used only for conservative classification. */ }
    const capability=classifyCriCapability317(response.status,diagnostic,
      request.headers.get('anthropic-beta')??'')
    const type = response.status === 401 ? 'authentication_error' :
      response.status === 403 ? 'permission_error' :
      response.status === 429 ? 'rate_limit_error' :
      response.status >= 500 ? 'api_error' : 'invalid_request_error'
    return Response.json({type:'error',request_id:requestId,error:{
      type,message:capability??'upstream inference request failed',
    }},{status:response.status,headers:{'x-request-id':requestId,
      'cache-control':'no-store'}})
  }
  const proxied = new Response(response.body, {
    status: response.status, headers: responseHeaders,
  })
  if (context.spend && path === '/v1/messages') {
    return meterGatewayResponse317(proxied, {
      store: context.spend, identity, config, model: payload.model,
      upstream: upstream.name, payingGroup: context.spendPolicy?.payingGroup ?? null,
      headers: context.spendPolicy?.headers ?? {}, audit,
    })
  }
  return proxied
}

export function listGatewayModels317(config, identity) : Response {
  const groups = identity.groups ?? []
  const permitted = config.upstreams.filter(up => !up.groups?.length ||
    up.groups.some(group => groups.includes(group)))
  const listed = new Set(config.models.flatMap(m =>
    permitted.some(up => m.upstream_model?.[up.name]) ? [m.id] : []))
  for (const up of permitted) for (const model of up.models ?? []) listed.add(model)
  return Response.json({
    data: [...listed].sort().map(id => ({
      id, type: 'model', display_name: id, created_at: '1970-01-01T00:00:00Z',
    })),
    has_more: false,
  }, { headers:{ 'cache-control':'no-store' } })
}
