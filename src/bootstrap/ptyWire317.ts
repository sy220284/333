// Claude Code 2.1.317 chunk-y196mk9y.js PTY binary wire contract.
export const PTY_DATA_KIND_317 = 0
export const PTY_CTRL_KIND_317 = 1
export const PTY_MAX_FRAME_BYTES_317 = 1_048_576
export const PTY_REPLAY_BYTES_317 = 262_144
export const PTY_MAX_DIMENSION_317 = 10_000
export type PtyFrame317 = { kind: 0; payload: Buffer } | { kind: 1; ctrl: Record<string, unknown> }
export function encodePtyData317(value: Buffer | string): Buffer {
  return encode(PTY_DATA_KIND_317, typeof value === 'string' ? Buffer.from(value) : value)
}
export function encodePtyControl317(value: Record<string, unknown>): Buffer {
  return encode(PTY_CTRL_KIND_317, Buffer.from(JSON.stringify(value)))
}
function encode(kind: number, bytes: Buffer): Buffer {
  if (bytes.length > PTY_MAX_FRAME_BYTES_317) throw new RangeError('PTY frame too large')
  const frame = Buffer.allocUnsafe(bytes.length + 5)
  frame.writeUInt32BE(bytes.length, 0)
  frame.writeUInt8(kind, 4)
  bytes.copy(frame, 5)
  return frame
}
export function createPtyFrameDecoder317(onFrame: (frame: PtyFrame317) => void,
  onFailure: (reason: string) => void): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0)
  let ended = false
  return chunk => {
    if (ended) return
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk
    while (buffer.length >= 5) {
      const size = buffer.readUInt32BE(0)
      if (size > PTY_MAX_FRAME_BYTES_317) {
        ended = true; onFailure('frame too large (' + size + ' > ' + PTY_MAX_FRAME_BYTES_317 + ')')
        return
      }
      if (buffer.length < size + 5) return
      const type = buffer.readUInt8(4), payload = buffer.subarray(5, 5 + size)
      buffer = buffer.subarray(5 + size)
      if (type === PTY_DATA_KIND_317) onFrame({ kind: 0, payload: Buffer.from(payload) })
      else if (type === PTY_CTRL_KIND_317) {
        try {
          const ctrl: unknown = JSON.parse(payload.toString('utf8'))
          if (!ctrl || typeof ctrl !== 'object' || Array.isArray(ctrl)) throw Error('bad ctrl object')
          onFrame({ kind: 1, ctrl: ctrl as Record<string, unknown> })
        } catch {
          ended = true; onFailure('bad ctrl json')
          return
        }
      } else {
        ended = true; onFailure('unknown frame kind ' + type)
        return
      }
    }
  }
}
export class PtyReplay317 {
  private fragments: Buffer[] = []
  private size = 0
  push(value: Buffer): void {
    this.fragments.push(Buffer.from(value))
    this.size += value.length
    while (this.size > PTY_REPLAY_BYTES_317 && this.fragments.length > 1) {
      const first = this.fragments.shift()!
      this.size -= first.length
    }
    if (this.size > PTY_REPLAY_BYTES_317 && this.fragments.length === 1) {
      const source = this.fragments[0]!
      let offset = source.length - PTY_REPLAY_BYTES_317
      while (offset < source.length && (source[offset]! & 0xc0) === 0x80) offset++
      this.fragments[0] = source.subarray(offset)
      this.size = this.fragments[0]!.length
    }
  }
  frames(): Buffer[] { return this.fragments.map(encodePtyData317) }
  tail(bytes = 4096): Buffer { return Buffer.concat(this.fragments).subarray(-bytes) }
}
