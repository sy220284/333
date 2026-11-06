import { expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import { createDesktopClient } from '../src/services/desktop/client.js'
import { serveDesktopStdio } from '../src/services/desktop/stdio.js'

test('typed desktop client correlates concurrent replies and handles protocol errors', async () => {
  const toServer = new PassThrough()
  const fromServer = new PassThrough()
  const serving = serveDesktopStdio(toServer, fromServer)
  const client = createDesktopClient(fromServer, toServer)
  const [hello, second] = await Promise.all([client.hello(), client.hello()])
  expect(hello.protocolVersion).toBe(1)
  expect(second.capabilities).toContain('permissions')
  await expect(client.invoke({ method: 'sessions.status', sessionId: '00000000-0000-4000-8000-000000000000' }))
    .rejects.toThrow('REQUEST_FAILED')
  client.close()
  toServer.end()
  await serving
})

test('typed desktop client rejects outstanding requests when its host disconnects', async () => {
  const fromServer = new PassThrough()
  const toServer = new PassThrough()
  const client = createDesktopClient(fromServer, toServer)
  const pending = client.hello()
  fromServer.end()
  await expect(pending).rejects.toThrow('disconnected')
  client.close()
  toServer.end()
})
