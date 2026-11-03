import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  advanceSpinnerStatusTracker, createSpinnerStatusTracker, deriveSpinnerStatus,
  describeSpinnerStatus, getProgressiveThinkingLabel, getSpinnerFrame,
  SPINNER_CYCLE_MS, SPINNER_METRICS_AFTER_MS, SPINNER_STALL_AFTER_MS,
} from '../src/components/Spinner/statusLogic.ts'

const input = (now, rest = {}) => ({
  now, isThinking: false, hasActiveTools: false, thinkingStatus: null,
  showToolCallTimer: true, outputLimitRecovery: null, ...rest,
})
const duration = ms => `${Math.floor(ms / 1000)}s`

describe('官方 2.1.310 对话状态与动画逻辑', () => {
  it('2 秒余弦曲线往返完整六帧，时间点严格对应', () => {
    assert.equal(SPINNER_CYCLE_MS, 2000)
    assert.equal(getSpinnerFrame(0, 6), 0)
    assert.equal(getSpinnerFrame(1000, 6), 5)
    assert.equal(getSpinnerFrame(2000, 6), 0)
    assert.equal(getSpinnerFrame(3000, 6), 5)
    for (const t of [0, 100, 500, 1000, 1250, 1700, 2000])
      assert.equal(getSpinnerFrame(t, 6), getSpinnerFrame(t + 2000, 6))
  })

  it('渐进思考文案按 10/20/30/45 秒的真实阈值变化', () => {
    assert.equal(getProgressiveThinkingLabel(9999), 'thinking')
    assert.equal(getProgressiveThinkingLabel(10000), 'still thinking')
    assert.equal(getProgressiveThinkingLabel(20000), 'thinking more')
    assert.equal(getProgressiveThinkingLabel(30000), 'thinking some more')
    assert.equal(getProgressiveThinkingLabel(45000), 'deep in thought')
    assert.equal(SPINNER_METRICS_AFTER_MS, 16000)
    assert.equal(SPINNER_STALL_AFTER_MS, 10000)
  })

  it('工具运行达两秒才显示计时，结束时保留完成提示', () => {
    let tracker = createSpinnerStatusTracker()
    tracker = advanceSpinnerStatusTracker(tracker, input(100, { hasActiveTools: true }))
    assert.equal(deriveSpinnerStatus(tracker, input(2099, { hasActiveTools: true })).kind, 'none')
    let active = deriveSpinnerStatus(tracker, input(2100, { hasActiveTools: true }))
    assert.deepEqual(active, { kind: 'tool-running', toolMs: 2000 })
    assert.equal(describeSpinnerStatus(active, '', duration), 'running tool for 2s')
    tracker = advanceSpinnerStatusTracker(tracker, input(3500))
    const done = deriveSpinnerStatus(tracker, input(3500))
    assert.deepEqual(done, { kind: 'tool-done', toolMs: 3400 })
    assert.equal(describeSpinnerStatus(done, '', duration), 'ran tool for 3s')
  })

  it('恢复上下文优先于工具结束，随后进入新的思考阶段', () => {
    let tracker = createSpinnerStatusTracker()
    tracker = advanceSpinnerStatusTracker(tracker, input(0, { hasActiveTools: true }))
    tracker = advanceSpinnerStatusTracker(tracker, input(4000))
    let status = deriveSpinnerStatus(tracker, input(4300, {
      outputLimitRecovery: { attempt: 2, limit: 4 },
    }))
    assert.equal(describeSpinnerStatus(status, '', duration), 'picking the thought back up (2 of 4)')
    tracker = advanceSpinnerStatusTracker(tracker, input(5000, {
      isThinking: true, thinkingStatus: 'thinking',
    }))
    status = deriveSpinnerStatus(tracker, input(15000, {
      isThinking: true, thinkingStatus: 'thinking',
    }))
    assert.equal(describeSpinnerStatus(status, ' (high)', duration), 'still thinking (high)')
    tracker = advanceSpinnerStatusTracker(tracker, input(16000, { thinkingStatus: 11000 }))
    assert.equal(deriveSpinnerStatus(tracker, input(16000, { thinkingStatus: 11000 })).kind, 'thought-for')
    assert.equal(describeSpinnerStatus({ kind: 'thought-for', thoughtMs: 200 }, '', duration), 'thought for 1s')
  })

  it('工具状态开关关闭时保持静默，低于两秒的工具不留下错误完成提示', () => {
    let tracker = createSpinnerStatusTracker()
    tracker = advanceSpinnerStatusTracker(tracker, input(0, { hasActiveTools: true }))
    assert.equal(deriveSpinnerStatus(tracker, input(5000, {
      hasActiveTools: true, showToolCallTimer: false,
    })).kind, 'none')
    tracker = advanceSpinnerStatusTracker(tracker, input(1500))
    assert.equal(deriveSpinnerStatus(tracker, input(1500)).kind, 'none')
  })
})
