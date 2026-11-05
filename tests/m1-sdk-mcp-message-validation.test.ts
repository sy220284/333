import { expect, test } from 'bun:test'
import { parseSdkTransportMessage } from '../src/services/mcp/validateSdkTransportMessage.js'

test('SDK control forwards a valid MCP JSON-RPC notification unchanged', () => {
  const notification = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }
  expect(parseSdkTransportMessage(notification)).toEqual(notification)
})

test('SDK control forwards valid MCP JSON-RPC requests and responses', () => {
  const request = {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/list',
  }
  expect(parseSdkTransportMessage(request)).toEqual(request)
  const response = {
    jsonrpc: '2.0',
    id: 7,
    result: {tools: []},
  }
  expect(parseSdkTransportMessage(response)).toEqual(response)
})

test('SDK control rejects malformed JSON-RPC before transport callback', () => {
  for (const invalid of [
    undefined,
    'notifications/initialized',
    {jsonrpc: '1.0', method: 'tools/list', id: 7},
    {jsonrpc: '2.0', method: 'tools/list', id: {bad: true}},
    {jsonrpc: '2.0', result: {}},
  ]) {
    expect(() => parseSdkTransportMessage(invalid))
      .toThrow(/SDK MCP message is not valid JSON-RPC/)
  }
})
