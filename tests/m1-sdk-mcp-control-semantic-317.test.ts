import { expect, test } from 'bun:test'
import { acknowledgeSdkMcpNonRequest } from '../src/entrypoints/sdk/mcpControlSemantics317.js'
import { parseSdkTransportMessage } from '../src/services/mcp/validateSdkTransportMessage.js'

// Ground truth: original Claude Code 2.1.317 chunk-4j0ac1xm.js:859–870,
// request missing-handler branch: 1254–1259.
test('官方 317：MCP 通知在已连接但没有 onmessage 回调时仍返回协议确认', () => {
  const notification = parseSdkTransportMessage({jsonrpc:'2.0',method:'notifications/initialized'})
  const ack = acknowledgeSdkMcpNonRequest({}, notification)
  expect(ack).toEqual({ jsonrpc: '2.0', result: {}, id: 0 })
})

test('官方 317：MCP 通知有处理器时先投递到连接，再返回协议确认', () => {
  const seen: unknown[] = []
  const notification = parseSdkTransportMessage({jsonrpc:'2.0',method:'notifications/initialized'})
  const ack = acknowledgeSdkMcpNonRequest({onmessage: message=>{seen.push(message)}},notification)
  expect(seen).toEqual([notification])
  expect(ack).toEqual({jsonrpc:'2.0',result:{},id:0})
})

test('官方 317：MCP 已有响应在无回调时不会误判为服务器断开', () => {
  const response = parseSdkTransportMessage({jsonrpc:'2.0',id:7,result:{tools:[]}})
  expect(acknowledgeSdkMcpNonRequest({},response)).toEqual({jsonrpc:'2.0',result:{},id:0})
})
