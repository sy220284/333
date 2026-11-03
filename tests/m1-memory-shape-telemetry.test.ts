import { describe, expect, test } from 'bun:test'
import { _resetForTesting, attachAnalyticsSink } from '../src/services/analytics/index.js'
import {
  logMemoryRecallShape,
  summarizeMemoryRecallShape,
} from '../src/memdir/memoryShapeTelemetry.js'
import type { MemoryHeader } from '../src/memdir/memoryScan.js'

const DAY = 86_400_000
const now = 1_700_000_000_000
const memory = (filename: string, ageDays: number): MemoryHeader => ({
  filename,
  filePath: `/private/memories/${filename}`,
  mtimeMs: now - ageDays * DAY,
  description: 'private context must not be sent',
  type: undefined,
})

describe('记忆召回聚合统计及隐私边界', () => {
  test('候选和选中数量、年龄跨度和近七天数量准确', () => {
    const candidates = [memory('a.md', 1), memory('b.md', 3), memory('c.md', 28)]
    expect(summarizeMemoryRecallShape(candidates, candidates.filter((_, i) => i === 0 || i === 2), now)).toEqual({
      candidateCount: 3,
      selectedCount: 2,
      selectionRate: 2 / 3,
      newestSelectedAgeDays: 1,
      oldestSelectedAgeDays: 28,
      selectedLast7Days: 1,
    })
  })

  test('已执行但没有召回时，年龄记为 -1 以区别未执行', () => {
    const result = summarizeMemoryRecallShape([memory('a.md', 1)], [], now)
    expect(result.selectedCount).toBe(0)
    expect(result.selectionRate).toBe(0)
    expect(result.newestSelectedAgeDays).toBe(-1)
    expect(result.oldestSelectedAgeDays).toBe(-1)
  })

  test('无候选和未来文件时间保持有限数值', () => {
    expect(summarizeMemoryRecallShape([], [], now).selectionRate).toBe(0)
    const future = memory('future.md', -10)
    expect(summarizeMemoryRecallShape([future], [future], now).newestSelectedAgeDays).toBe(0)
  })

  test('日志仅记录数字，不包括路径、文件名、内容和描述', () => {
    const events: Array<{ name: string; metadata: Record<string, number | boolean | undefined> }> = []
    _resetForTesting()
    attachAnalyticsSink({
      logEvent: (name, metadata) => events.push({ name, metadata }),
      logEventAsync: async () => {},
    })
    const candidate = memory('passwords.md', 0)
    logMemoryRecallShape([candidate], [candidate])
    expect(events.length).toBe(1)
    expect(events.map(e => e.name)).toEqual(['tengu_memory_recall_shape'])
    expect(events.every(e => Object.values(e.metadata).every(v => typeof v === 'number'))).toBe(true)
    expect(JSON.stringify(events)).not.toContain('passwords')
    expect(JSON.stringify(events)).not.toContain('/private')
    expect(JSON.stringify(events)).not.toContain('private context')
    _resetForTesting()
  })
})
