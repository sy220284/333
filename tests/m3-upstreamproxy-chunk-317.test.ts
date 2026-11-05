import { test, expect } from 'bun:test'
import { encodeChunk, decodeChunk } from '../src/upstreamproxy/relay.ts'

test('317 upstream proxy protobuf frames retain exact bytes without a second copy', () => {
  for (const count of [0, 1, 127, 128, 1024, 512 * 1024]) {
    const input = new Uint8Array(count + 4)
    for (let i = 0; i < input.length; i++) input[i] = i % 251
    const slice = input.subarray(2, count + 2)
    const encoded = encodeChunk(slice)
    // encodeChunk creates one fully owned buffer; WebSocket can transmit it
    // directly, including for subarray inputs whose source has an offset.
    expect(encoded.byteOffset).toBe(0)
    expect(encoded.byteLength).toBe(encoded.buffer.byteLength)
    const decoded = decodeChunk(new Uint8Array(encoded.buffer))
    expect(decoded).not.toBeNull()
    expect(Array.from(decoded!)).toEqual(Array.from(slice))
  }
})
