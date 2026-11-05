import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod/v4'
import { StructuredIO } from '../src/cli/structuredIO.ts'
import type { SDKControlRequest } from '../src/entrypoints/sdk/controlTypes.ts'
import { Stream } from '../src/utils/stream.ts'

type RequestAccess = { sendRequest(request: SDKControlRequest['request'], schema: z.Schema, signal: AbortSignal, id: string): Promise<unknown> }
const ask = { subtype: 'can_use_tool' as const, tool_name: 'Bash', input: { command: 'pwd' }, tool_use_id: 'tool-1' }

test('317 SDK cancellation clears pending permission and notifies the bridge synchronously', async () => {
  const input = new Stream<string>()
  const io = new StructuredIO(input)
  const resolved: string[] = []
  io.setOnControlRequestResolved(id => { resolved.push(id) })
  const controller = new AbortController()
  const promise = (io as unknown as RequestAccess).sendRequest(ask, z.object({}), controller.signal, 'request-1')
  const rejected = assert.rejects(promise, /Abort/)
  assert.equal(io.getPendingPermissionRequests().length, 1)
  assert.equal((await io.outbound.next()).value.type, 'control_request')
  controller.abort()
  assert.equal(io.getPendingPermissionRequests().length, 0)
  assert.deepEqual(resolved, ['request-1'])
  assert.deepEqual((await io.outbound.next()).value, { type: 'control_cancel_request', request_id: 'request-1' })
  await rejected
})

test('317 SDK a late permission answer after abort is ignored without replaying the tool', async () => {
  const input = new Stream<string>()
  const io = new StructuredIO(input)
  let unexpected = 0
  io.setUnexpectedResponseCallback(async () => { unexpected++ })
  const controller = new AbortController()
  const pending = (io as unknown as RequestAccess).sendRequest(ask, z.object({}), controller.signal, 'request-1')
  const rejected = assert.rejects(pending, /Abort/)
  controller.abort()
  await rejected
  input.enqueue(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'request-1', response: { behavior: 'allow', toolUseID: 'tool-1' } } }) + '\n')
  input.done()
  for await (const _message of io.structuredInput) { /* drain */ }
  assert.equal(unexpected, 0)
  assert.equal(io.getPendingPermissionRequests().length, 0)
})

test('317 SDK old request cleanup cannot delete a replacement with the same identity', async () => {
  const input = new Stream<string>()
  const io = new StructuredIO(input)
  const firstController = new AbortController()
  const access = io as unknown as RequestAccess
  const first = access.sendRequest(ask, z.object({}), firstController.signal, 'shared-id')
  const rejected = assert.rejects(first, /Abort/)
  firstController.abort()
  const replacementController = new AbortController()
  const replacement = access.sendRequest({ ...ask, tool_use_id: 'tool-2' }, z.object({}), replacementController.signal, 'shared-id')
  const replacementRejected = assert.rejects(replacement, /Abort/)
  await rejected
  assert.equal(io.getPendingPermissionRequests().length, 1)
  replacementController.abort()
  await replacementRejected
  assert.equal(io.getPendingPermissionRequests().length, 0)
})
