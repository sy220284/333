import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { describe, it } from 'node:test'
import {
  connectInkDevtoolsSocket,
  isReactDevtoolsReachable,
} from '../src/ink/devtools.ts'

class FakeSocket {
  readyState = 1
  events = new Map()
  writes = []
  addEventListener(name, callback) {
    const list = this.events.get(name) ?? []
    list.push(callback)
    this.events.set(name, list)
  }
  emit(name, data) {
    for (const listener of this.events.get(name) ?? []) listener({ data })
  }
  send(payload) { this.writes.push(payload) }
  close() { this.emit('close') }
}

describe('Ink developer-tools actual protocol', () => {
  it('routes incoming JSON and outgoing messages, ignores malformed frames', () => {
    const socket = new FakeSocket()
    const messages = []
    let protocol
    const core = {
      initialize() {},
      connectWithCustomMessagingProtocol(options) { protocol = options },
    }
    connectInkDevtoolsSocket(socket, core)
    socket.emit('open')
    assert.ok(protocol)
    const listener = message => messages.push(message)
    protocol.onSubscribe(listener)
    socket.emit('message', '{"event":"ping","payload":4}')
    socket.emit('message', 'not-json')
    assert.deepEqual(messages, [{ event: 'ping', payload: 4 }])
    protocol.onMessage('pong', { received: true })
    assert.deepEqual(socket.writes.map(JSON.parse), [{ event: 'pong', payload: { received: true } }])
    protocol.onUnsubscribe(listener)
    socket.emit('message', '{"event":"ping"}')
    assert.equal(messages.length, 1)
    socket.readyState = 3
    protocol.onMessage('closed', null)
    assert.equal(socket.writes.length, 1)
  })

  it('clears subscribed listeners and shuts down the agent when disconnected', () => {
    const socket = new FakeSocket()
    let protocol
    let stopped = 0
    const original = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      reactDevtoolsAgent: { shutdown: () => stopped++ },
    }
    try {
      const received = []
      connectInkDevtoolsSocket(socket, {
        initialize() {},
        connectWithCustomMessagingProtocol(options) { protocol = options },
      })
      socket.emit('open')
      protocol.onSubscribe(value => received.push(value))
      socket.emit('close')
      socket.emit('message', '{"event":"after-close"}')
      assert.equal(stopped, 1)
      assert.equal(received.length, 0)
    } finally {
      if (original === undefined) delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__
      else globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = original
    }
  })

  it('tests the actual local TCP devtools port without dialing external addresses', async () => {
    const server = createServer(socket => socket.end())
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    assert.ok(addr && typeof addr !== 'string')
    const port = addr.port
    try {
      assert.equal(await isReactDevtoolsReachable(port), true)
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
    assert.equal(await isReactDevtoolsReachable(port), false)
  })
})
