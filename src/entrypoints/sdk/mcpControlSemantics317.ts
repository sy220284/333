import type { JSONRPCMessage } from '@modelcontextprotocol/server'
import type { SdkControlServerTransport } from '../../services/mcp/SdkControlTransport.js'

/** 2.1.317 chunk-4j0ac1xm.js:859–870. A notification or JSON-RPC response
 * is acknowledged even when no callback is registered on a connected MCP
 * transport. A request with an ID, by contrast, requires a handler. */
export function acknowledgeSdkMcpNonRequest(
  transport: Pick<SdkControlServerTransport, 'onmessage'>,
  message: JSONRPCMessage,
) {
  transport.onmessage?.(message)
  return { jsonrpc: '2.0' as const, result: {}, id: 0 }
}
