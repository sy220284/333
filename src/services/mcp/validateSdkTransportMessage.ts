import {
  JSONRPCMessageSchema,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js'

/**
 * Validate the untrusted SDK control payload before entering an MCP transport.
 * An invalid message must not be dispatched to the server callback.
 */
export function parseSdkTransportMessage(value: unknown): JSONRPCMessage {
  const parsed = JSONRPCMessageSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      'SDK MCP message is not valid JSON-RPC: ' +
        parsed.error.issues
          .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
    )
  }
  return parsed.data
}
