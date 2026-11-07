import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isLocalCapabilityEnabled,
  setLocalCapabilityEnabled,
} from '../src/utils/localCapabilities.ts'
import localFeatures from '../src/commands/features.ts'

test('功能开关真实写入本地配置并可读取', () => {
  const initial = isLocalCapabilityEnabled('auto-memory')
  try {
    setLocalCapabilityEnabled('auto-memory', true)
    assert.equal(isLocalCapabilityEnabled('auto-memory'), true)
    setLocalCapabilityEnabled('auto-memory', false)
    assert.equal(isLocalCapabilityEnabled('auto-memory'), false)
  } finally {
    setLocalCapabilityEnabled('auto-memory', initial)
  }
})
test('/features 可以由用户直接控制高级功能', async () => {
  const { call } = await localFeatures.load()
  const initial = isLocalCapabilityEnabled('scheduled-tasks')
  try {
    const status = await call('status', {} as never)
    assert.equal(status.type, 'text')
    if (status.type === 'text') assert.match(status.value, /定时任务.*scheduled-tasks/)
    const enabled = await call('on scheduled-tasks', {} as never)
    assert.equal(enabled.type, 'text')
    assert.equal(isLocalCapabilityEnabled('scheduled-tasks'), true)
    await call('off scheduled-tasks', {} as never)
    assert.equal(isLocalCapabilityEnabled('scheduled-tasks'), false)
  } finally {
    setLocalCapabilityEnabled('scheduled-tasks', initial)
  }
})
