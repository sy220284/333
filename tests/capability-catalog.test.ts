import { expect, test } from 'bun:test'
import {
  normalizeCapabilityCatalog,
  type CapabilityEntry,
} from '../src/services/agentCenter/capabilityCatalog.js'

const skill: CapabilityEntry = {
  id: 'skill:project:subtitle-correction',
  name: '字幕校正',
  kind: 'skill',
  source: 'project',
  scope: 'project-or-user',
  description: '对齐字幕时间基准',
  status: 'available',
  version: '1.0.0',
}
test('相同能力 ID 去重并维持可预测排序', () => {
  const items = normalizeCapabilityCatalog([
    skill,
    { ...skill, id: 'mcp:project:subtitle', kind: 'mcp', status: 'configured', name: '字幕服务' },
    { ...skill },
  ])
  expect(items).toHaveLength(2)
  expect(items[0]?.kind).toBe('mcp')
  expect(items[1]?.id).toBe(skill.id)
})
test('拒绝同 ID 的不同来源/状态，防止 UI 展示错误能力', () => {
  expect(() => normalizeCapabilityCatalog([skill, { ...skill, status: 'disabled' }]))
    .toThrow('冲突')
  expect(() => normalizeCapabilityCatalog([{ ...skill, id: '' }]))
    .toThrow('缺失')
})
