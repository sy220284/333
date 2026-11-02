import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { CCRClient } from '../src/cli/transports/ccrClient.js'
import type { SSETransport } from '../src/cli/transports/SSETransport.js'

test('closing a remote session cancels pending ephemeral events without throwing', async () => {
  const previousNoProxy = process.env.no_proxy
  process.env.no_proxy = `${previousNoProxy ?? ''},127.0.0.1`
  let requests = 0
  const server = createServer((_req, res) => { requests++; res.writeHead(200).end() })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('expected an IPv4 listener')
  const transport = { setOnEvent() {} } as unknown as SSETransport
  const client = new CCRClient(transport, new URL(`http://127.0.0.1:${address.port}/v1/code/sessions/test`), {
    getAuthHeaders: () => ({ Authorization: 'Bearer local-only-test' }),
  })
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
    if (previousNoProxy === undefined) delete process.env.no_proxy
    else process.env.no_proxy = previousNoProxy
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('remote uploads preserve event boundaries and never repeat previous batches', async () => {
  const previousNoProxy = process.env.no_proxy
  process.env.no_proxy = `${previousNoProxy ?? ''},127.0.0.1`
  const received: Array<{ payload: { uuid: string; event: { type: string; delta?: { text?: string } } }; ephemeral?: boolean }> = []
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const part of req) raw += part
    received.push(...JSON.parse(raw).events)
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('expected an IPv4 listener')
  const transport = { setOnEvent() {} } as unknown as SSETransport
  const client = new CCRClient(transport, new URL(`http://127.0.0.1:${address.port}/v1/code/sessions/test`), {
    getAuthHeaders: () => ({ Authorization: 'Bearer local-only-test' }),
  })
  const delta = (uuid: string, text: string) => ({
    type: 'stream_event' as const, uuid, session_id: 'test', parent_tool_use_id: null,
    event: { type: 'content_block_delta' as const, index: 0, delta: { type: 'text_delta' as const, text } },
  })
  const flush = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        client.flush(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('remote flush timed out')), 5000) }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  try {
    await client.writeEvent(delta('one', 'A'))
    await client.writeEvent(delta('two', 'B'))
    await client.writeEvent({ type: 'stream_event', uuid: 'boundary', session_id: 'test', parent_tool_use_id: null, event: { type: 'content_block_stop', index: 0 } })
    await flush()
    await client.writeEvent(delta('three', 'C'))
    await flush()
    expect(received.map(({ payload, ephemeral }) => ({ uuid: payload.uuid, type: payload.event.type, text: payload.event.delta?.text, ephemeral }))).toEqual([
      { uuid: 'one', type: 'content_block_delta', text: 'AB', ephemeral: true },
      { uuid: 'boundary', type: 'content_block_stop', text: undefined, ephemeral: true },
      { uuid: 'three', type: 'content_block_delta', text: 'C', ephemeral: true },
    ])
  } finally {
    client.close()
    if (previousNoProxy === undefined) delete process.env.no_proxy
    else process.env.no_proxy = previousNoProxy
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}, 15_000)
