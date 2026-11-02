import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { CCRClient } from '../src/cli/transports/ccrClient.js'
import type { SSETransport } from '../src/cli/transports/SSETransport.js'

test('closing a remote session cancels pending ephemeral events without throwing', async () => {
  let requests = 0
  const server = createServer((_req, res) => { requests++; res.writeHead(200).end() })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('expected an IPv4 listener')
  const transport = { setOnEvent() {} } as unknown as SSETransport
  const client = new CCRClient(transport, new URL(`http://127.0.0.1:${address.port}/v1/code/sessions/test`))
  try {
    await client.writeEvent({
      type: 'stream_event',
      uuid: 'event-1',
      session_id: 'test',
      parent_tool_use_id: null,
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } },
    })
    expect(() => client.close()).not.toThrow()
    await Bun.sleep(150)
    expect(requests).toBe(0)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
