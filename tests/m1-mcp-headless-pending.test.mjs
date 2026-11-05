import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  beginHeadlessMcpElicitation,
  isHeadlessMcpElicitationPending,
} from '../src/services/mcp/headlessElicitationState.ts'

test('无回答时会话确实处于等待状态，回答后及时清理', () => {
  const client = {}
  assert.equal(isHeadlessMcpElicitationPending(client), false)
  const finish = beginHeadlessMcpElicitation(client)
  assert.equal(isHeadlessMcpElicitationPending(client), true)
  finish()
  assert.equal(isHeadlessMcpElicitationPending(client), false)
})

test('并发请求必须全部退出才清理，完成回调可重复调用', () => {
  const client = {}
  const one = beginHeadlessMcpElicitation(client)
  const two = beginHeadlessMcpElicitation(client)
  one()
  one()
  assert.equal(isHeadlessMcpElicitationPending(client), true)
  two()
  assert.equal(isHeadlessMcpElicitationPending(client), false)
})

test('同名服务的不同连接不能相互污染', () => {
  const oldClient = {}
  const newClient = {}
  const finish = beginHeadlessMcpElicitation(oldClient)
  assert.equal(isHeadlessMcpElicitationPending(newClient), false)
  finish()
})

test('无界面MCP真正以try/finally释放授权状态，超时入口读取状态', () => {
  const print = readFileSync(
    new URL('../src/cli/print.ts', import.meta.url), 'utf8',
  )
  const client = readFileSync(
    new URL('../src/services/mcp/client.ts', import.meta.url), 'utf8',
  )
  assert.match(print, /beginHeadlessMcpElicitation\(connection\.client\)/)
  assert.match(print, /finally\s*\{\s*finishElicitation\(\)/)
  assert.match(client, /isHeadlessMcpElicitationPending\(client\)/)
  assert.match(client, /timed out while the server's elicitation request was unanswered/)
  assert.match(client, /Do not automatically repeat this tool call/)
})
