import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  discoverMcpSkills,
  isSkillResource,
  readMcpSkillResource,
} from '../src/skills/mcpSkills.ts'
import type { MCPServerConnection } from '../src/services/mcp/types.ts'
import { isCrossSessionMessagingEnabled } from '../src/utils/crossSessionMessaging.ts'
import { resolveLocalPeerRecipient, type LiveLocalPeer317 } from '../src/utils/livePeerSessions.ts'
const URI = 'skill://local/review'
function localClient(pages: Array<{ resources: Array<{ uri: string; name: string; description?: string }>; nextCursor?: string }>): MCPServerConnection {
  let count = 0
  return {
    name: 'local',
    type: 'connected',
    capabilities: { resources: {} },
    client: {
      async listResources() { return pages[count++] ?? { resources: [] } },
      async readResource({ uri }: { uri: string }) {
        assert.equal(uri, URI)
        return { contents: [{ uri, text: 'Review this code locally', mimeType: 'text/plain' }] }
      },
    },
  } as unknown as MCPServerConnection
}
test('MCP skill:// 资源转为可调用技能命令，并按需读取内容', async () => {
  const client = localClient([{ resources: [
    { uri: URI, name: 'review', description: 'Code review' },
    { uri: 'file:///private.txt', name: 'ignored' },
  ] }])
  const commands = await discoverMcpSkills(client)
  assert.equal(commands.length, 1)
  assert.equal(commands[0]?.name, 'mcp__local__review')
  assert.equal(commands[0]?.loadedFrom, 'mcp')
  assert.equal(commands[0]?.type, 'prompt')
  assert.deepEqual(await readMcpSkillResource(client as never, URI), [
    { type: 'text', text: 'Review this code locally' },
  ])
  assert.equal(isSkillResource({ uri: 'file:///test', name: 'test' } as never), false)
})
test('技能分页去重并排除无关资源', async () => {
  const client = localClient([
    { resources: [{ uri: URI, name: 'review' }], nextCursor: 'next' },
    { resources: [{ uri: URI, name: 'review' }, { uri: 'skill://local/verify', name: 'verify' }] },
  ])
  const commands = await discoverMcpSkills(client)
  assert.deepEqual(commands.map(c => c.name), ['mcp__local__review', 'mcp__local__verify'])
})
test('本地会话通信默认可用，用户可以明确关闭', () => {
  const old = process.env.CLAUDE_CODE_HARBOR_KITE
  try {
    delete process.env.CLAUDE_CODE_HARBOR_KITE
    assert.equal(isCrossSessionMessagingEnabled(), true)
    process.env.CLAUDE_CODE_HARBOR_KITE = '0'
    assert.equal(isCrossSessionMessagingEnabled(), false)
  } finally {
    if (old === undefined) delete process.env.CLAUDE_CODE_HARBOR_KITE
    else process.env.CLAUDE_CODE_HARBOR_KITE = old
  }
})

test('本地会话名称冲突必须显式指定引用，云端地址不能混入', () => {
  const p = (name: string, ref: string): LiveLocalPeer317 => ({
    id: ref, name, ref, address: 'uds:/tmp/sessions/' + ref,
    kind: 'interactive', status: 'busy', socketPath: '/tmp/sessions/' + ref,
  })
  const peers = [p('test', 'aaaaaa'), p('test', 'bbbbbb')]
  assert.deepEqual(resolveLocalPeerRecipient(peers, 'test'), {
    address: undefined, ambiguous: true,
  })
  assert.deepEqual(resolveLocalPeerRecipient(peers, 'test [bbbbbb]'), {
    address: 'uds:/tmp/sessions/bbbbbb', ambiguous: false,
  })
  assert.deepEqual(resolveLocalPeerRecipient(peers, 'bridge:remote'), {
    address: undefined, ambiguous: false,
  })
})
