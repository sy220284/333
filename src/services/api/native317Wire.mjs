/**
 * Native Claude Code 2.1.317 Messages API wire contract.
 *
 * The recovered application currently builds against @anthropic-ai/sdk 1.3,
 * while the official 2.1.317 release uses 0.128. The two SDKs select
 * different resource paths, default API dates, and API-key header names.
 *
 * Apply the native resource contract at the single SDK fetch boundary.
 * Only beta Messages endpoints are eligible; generic fetch, provider-specific
 * Bedrock/Vertex transports, OAuth authentication, and custom headers remain
 * under their normal owners.
 */
export const NATIVE_317_API_VERSION = '2023-06-01'

export function native317MessagesRequest(input, init, { apiKey } = {}) {
  const uri = input instanceof Request ? input.url : String(input)
  const parsed = new URL(uri)
  if (parsed.pathname !== '/v1/messages' &&
      parsed.pathname !== '/v1/messages/count_tokens') {
    return { input, init }
  }

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  if (!headers.has('anthropic-beta')) return { input, init }

  parsed.searchParams.set('beta', 'true')
  headers.set('anthropic-version', NATIVE_317_API_VERSION)

  // SDK 1.3 emits API keys as Bearer, while the native 0.128 SDK uses
  // x-api-key. Preserve user-supplied Authorization and subscriber OAuth.
  const auth = headers.get('authorization')
  if (apiKey && (!auth || auth === 'Bearer ' + apiKey)) {
    headers.set('x-api-key', apiKey)
    if (auth) headers.delete('authorization')
  }

  const target = input instanceof Request ? new Request(parsed.toString(), input) : parsed.toString()
  return { input: target, init: { ...init, headers } }
}
