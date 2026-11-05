import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { createRemoteSessionConfig, RemoteSessionManager } from '../src/remote/RemoteSessionManager.js'

test('remote task stops are routed by session and acknowledged by request ID', { timeout: 5000 }, async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const env = {
    USER_TYPE: 'ant',
    USE_LOCAL_OAUTH: '1',
    CLAUDE_LOCAL_OAUTH_API_BASE: `http://127.0.0.1:${address.port}`,
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  const requests: Array<[string, string]> = []
  let markPending!: () => void
  const pendingReceived = new Promise<void>(resolve => { markPending = resolve })
  server.on('connection', (socket, request) => {
    const session = request.url!.split('/')[4]!
    socket.on('message', bytes => {
      const { request_id, request: control } = JSON.parse(bytes.toString())
      assert.equal(control.subtype, 'stop_task')
      requests.push([session, control.task_id])
      if (control.task_id === 'pending-task') {
        markPending()
        return
      }
      const response = session === 'runner-a'
        ? { subtype: 'success', request_id, response: {} }
        : { subtype: 'error', request_id, error: 'Task not found on runner-b' }
      socket.send(JSON.stringify({ type: 'control_response', response }))
    })
  })
  const clients: RemoteSessionManager[] = []
  try {
    await Promise.all(['runner-a', 'runner-b'].map(session =>
      new Promise<void>((resolve, reject) => {
        const client = new RemoteSessionManager(
          createRemoteSessionConfig(session, () => 'fixture-token', 'fixture-org'),
          { onConnected: resolve, onError: reject, onMessage() {}, onPermissionRequest() {} },
        )
        clients.push(client)
        client.connect()
      }),
    ))
    await Promise.all([
      clients[0]!.stopTask('shared-task-id'),
      assert.rejects(clients[1]!.stopTask('shared-task-id'), /Task not found on runner-b/),
    ])
    assert.deepEqual(requests.sort(), [
      ['runner-a', 'shared-task-id'],
      ['runner-b', 'shared-task-id'],
    ])
    const pending = clients[0]!.stopTask('pending-task')
    const rejection = assert.rejects(pending, /closed before task stop acknowledgment/)
    await pendingReceived
    clients[0]!.reconnect()
    await rejection
  } finally {
    for (const client of clients) client.disconnect()
    for (const socket of server.clients) socket.terminate()
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
