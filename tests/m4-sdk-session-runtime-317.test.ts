import assert from 'node:assert/strict'
import test from 'node:test'
import {
  query,
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  unstable_v2_prompt,
} from '../src/entrypoints/agentSdkTypes.js'

/** Product contract: the SDK's independent AI conversation route has retired.
 * The interactive UI, its MCP tools, hooks, and internal runner protocols remain.
 */
test('SDK v2 cannot create an independent headless conversation', () => {
  assert.throws(
    () => unstable_v2_createSession({}),
    /333 已移除 SDK 无界面对话模式/,
  )
  assert.throws(
    () => unstable_v2_resumeSession('11111111-1111-4111-8111-111111111111', {}),
    /333 已移除 SDK 无界面对话模式/,
  )
  assert.throws(
    () => query({ prompt: '无界面执行', options: {} }),
    /333 已移除 SDK 无界面对话模式/,
  )
})

test('SDK one-shot cannot start headless execution either', async () => {
  await assert.rejects(
    unstable_v2_prompt('执行任务', {}),
    /333 已移除 SDK 无界面对话模式/,
  )
})
