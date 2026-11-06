import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { DesktopRequestSchema, type DesktopReply, type DesktopEvent } from './protocol.js'
import { createDesktopGateway, type DesktopGatewayOptions } from './gateway.js'

const MAX_REQUEST_BYTES = 4 * 1024 * 1024

/** Local-only bidirectional desktop transport: one JSON request per stdin
 * line; correlated replies and unsolicited SDK events on stdout. Both paths
 * are serialized so a slow desktop consumer cannot interleave JSON frames. */
export async function serveDesktopStdio(
  input: Readable,
  output: Writable,
  options: DesktopGatewayOptions = {},
  createGateway: typeof createDesktopGateway = createDesktopGateway,
): Promise<void> {
  const gateway = createGateway(options)
  const pending = new Set<Promise<void>>()
  let writer = Promise.resolve()
  let outputError: Error | undefined
  function writeFrame(frame: DesktopReply | DesktopEvent): Promise<void> {
    if (outputError) return Promise.reject(outputError)
    const line = JSON.stringify(frame) + '\n'
    const step = writer.then(() => new Promise<void>((accept, reject) => {
      output.write(line, error => error ? reject(error) : accept())
    }))
    // Preserve the failure for the caller; do not create an unhandled
    // rejection from the continuing serialized writer chain.
    writer = step.catch(error => { outputError = error instanceof Error ? error : new Error(String(error)) })
    return step
  }
  const stopEvents = gateway.subscribe(event => {
    const write = writeFrame(event)
    const pendingWrite = write.then(() => {}, error => {
      outputError = error instanceof Error ? error : new Error(String(error))
    })
    pending.add(pendingWrite)
    void pendingWrite.then(() => pending.delete(pendingWrite))
  })
  const reader = createInterface({ input, crlfDelay: Infinity, terminal: false })
  async function handleLine(line: string): Promise<void> {
    let id: string | null = null
    try {
      if (Buffer.byteLength(line, 'utf8') > MAX_REQUEST_BYTES) {
        throw new TypeError('Desktop request exceeds 4 MiB')
      }
      const raw: unknown = JSON.parse(line)
      if (raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string') id = raw.id
      const parsed = DesktopRequestSchema.safeParse(raw)
      if (!parsed.success) {
        await writeFrame({ id, ok: false, error: { code: 'INVALID_REQUEST', message: parsed.error.issues.map(issue => issue.message).join('; ') } })
        return
      }
      const result = await gateway.handle(parsed.data)
      await writeFrame({ id: parsed.data.id, ok: true, result })
    } catch (error) {
      await writeFrame({
        id, ok: false,
        error: { code: error instanceof SyntaxError || error instanceof TypeError ? 'INVALID_REQUEST' : 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  try {
    for await (const line of reader) {
      if (outputError) throw outputError
      if (!line.trim()) continue
      let task: Promise<void>
      task = handleLine(line).finally(() => pending.delete(task))
      pending.add(task)
    }
  } finally {
    reader.close()
    stopEvents()
    const shutdown = gateway.close()
    const completed = await Promise.allSettled([...pending, shutdown])
    await writer
    if (outputError) throw outputError
    const first = completed.find((item): item is PromiseRejectedResult => item.status === 'rejected')
    if (first) throw first.reason
  }
}
