import { expect, test } from 'bun:test'
import {
  getReplBridgeHandle,
  isReplBridgeActive,
  setReplBridgeHandle,
} from '../src/bridge/replBridgeHandle.js'
import type { ReplBridgeHandle } from '../src/bridge/replBridge.js'

const bridge: ReplBridgeHandle = {
  bridgeSessionId: '11111111-2222-4333-8444-555555555555',
  environmentId: 'test-env',
  sessionIngressUrl: 'https://example.invalid',
  writeMessages() {},
  writeSdkMessages() {},
  sendControlRequest() {},
  sendControlResponse() {},
  sendControlCancelRequest() {},
  sendResult() {},
  async teardown() {},
}

test('a connected inbound bridge enables peer messages and exposes its handle', () => {
  try {
    setReplBridgeHandle(bridge, false)
    expect(isReplBridgeActive()).toBe(true)
    expect(getReplBridgeHandle()).toBe(bridge)
  } finally {
    setReplBridgeHandle(null, false)
  }
})

test('an outbound-only CCR mirror retains the handle but blocks peer messaging', () => {
  try {
    setReplBridgeHandle(bridge, true)
    expect(isReplBridgeActive()).toBe(false)
    expect(getReplBridgeHandle()).toBe(bridge)
  } finally {
    setReplBridgeHandle(null, false)
  }
})

test('bridge teardown resets peer messaging capability', () => {
  setReplBridgeHandle(bridge, false)
  setReplBridgeHandle(null, false)
  expect(getReplBridgeHandle()).toBeNull()
  expect(isReplBridgeActive()).toBe(false)
})
