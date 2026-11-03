import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  advanceSpinnerStatusTracker, createSpinnerStatusTracker, deriveSpinnerStatus,
  describeSpinnerStatus, getProgressiveThinkingLabel, getSpinnerFrame, getRetryCountdownMs, describeRetryStatus, advanceAnimatedTokenCount,
  SPINNER_CYCLE_MS, SPINNER_METRICS_AFTER_MS, SPINNER_STALL_AFTER_MS,
} from '../src/components/Spinner/statusLogic.ts'

const input = (now, rest = {}) => ({
  now, isThinking: false, hasActiveTools: false, thinkingStatus: null,
  showToolCallTimer: true, outputLimitRecovery: null, ...rest,
})
const duration = ms => `${Math.floor(ms / 1000)}s`

describe('官方 2.1.310 对话状态与动画逻辑', () => {
  it('独立加载指示器与主对话行采用同一两秒动画曲线', () => {
    const source = readFileSync(new URL('../src/components/Spinner.tsx', import.meta.url), 'utf8')
    assert.match(source, /getSpinnerFrame\(time, DEFAULT_CHARACTERS\.length\)/)
    assert.match(source, /useAnimationFrame\(reducedMotion \? null : 50\)/)
    assert.doesNotMatch(source, /Math\.floor\(time \/ 120\)/)
    const animation = readFileSync(new URL('../src/components/Spinner/SpinnerAnimationRow.tsx', import.meta.url), 'utf8')
    assert.match(animation, /mode === 'requesting' \? 50 : 100/)
    assert.match(animation, /advanceAnimatedTokenCount\(/)
  })

  it('2 秒余弦曲线往返完整六帧，时间点严格对应', () => {
    assert.equal(SPINNER_CYCLE_MS, 2000)
    assert.equal(getSpinnerFrame(0, 6), 0)
    assert.equal(getSpinnerFrame(1000, 6), 5)
    assert.equal(getSpinnerFrame(2000, 6), 0)
    assert.equal(getSpinnerFrame(3000, 6), 5)
    for (const t of [0, 100, 500, 1000, 1250, 1700, 2000])
      assert.equal(getSpinnerFrame(t, 6), getSpinnerFrame(t + 2000, 6))
  })

  it('令牌计数每逻辑50ms平滑追随，缩短与大量跳变正确处理', () => {
    assert.equal(advanceAnimatedTokenCount(0, 100, 1), 15)
    assert.equal(advanceAnimatedTokenCount(100, 0, 1), 85)
    assert.equal(advanceAnimatedTokenCount(10, 0, 10), 0)
    assert.equal(advanceAnimatedTokenCount(0, 300, 2), 100)
    assert.equal(advanceAnimatedTokenCount(0, 2500, 1), 2500)
    assert.equal(advanceAnimatedTokenCount(120, 120, 5), 120)
    assert.equal(advanceAnimatedTokenCount(120, 0, 0), 120)
  })

  it('短对话也会生成完成耗时记录，与官方终态一致', () => {
    const repl = readFileSync(new URL('../src/screens/REPL.tsx', import.meta.url), 'utf8')
    assert.match(repl, /if \(!abortController\.signal\.aborted && !proactiveActive\) \{/)
    assert.doesNotMatch(repl, /turnDurationMs > 30000/)
    assert.match(repl, /createTurnDurationMessage\(turnDurationMs, budgetInfo/)
  })

  it('新版默认使用完整终端对话布局，同时保留主动关闭选项', () => {
    const fullscreen = readFileSync(new URL('../src/utils/fullscreen.ts', import.meta.url), 'utf8')
    assert.match(fullscreen, /isEnvDefinedFalsy\(process\.env\.CLAUDE_CODE_NO_FLICKER\)/)
    assert.match(fullscreen, /isTmuxControlMode\(\)/)
    assert.match(fullscreen, /export function isFullscreenEnvEnabled[\s\S]*?return true/)
  })

  it('每轮完成耗时同时显示结束时间', () => {
    const renderer = readFileSync(new URL('../src/components/messages/SystemTextMessage.tsx', import.meta.url), 'utf8')
    assert.match(renderer, /new Date\(message\.timestamp\)\.toLocaleTimeString/)
    assert.ok(renderer.includes('· 完成 ${finishedAt}'))
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
    const active = deriveSpinnerStatus(tracker, input(2100, { hasActiveTools: true }))
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

  it('API重试倒计时按整秒取整，并覆盖网络与等待状态', () => {
    const retry = { kind: 'retrying', deadline: 12_300, attempt: 2, maxRetries: 4, reason: 'Rate limited' }
    assert.equal(getRetryCountdownMs(12_300, 10_000), 3000)
    assert.equal(getRetryCountdownMs(12_300, 12_301), 0)
    assert.equal(describeRetryStatus(retry, 10_000, duration),
      'API error · Retrying in 3s · attempt 2/4')
    assert.equal(describeRetryStatus({ ...retry, attempt: 3 }, 10_000, duration),
      'Rate limited · Retrying in 3s · attempt 3/4')
    assert.equal(describeRetryStatus({ ...retry, kind: 'stalled' }, 10_000, duration),
      'Waiting for API response · will retry in 3s · check your network')
    assert.match(describeRetryStatus({ ...retry, kind: 'low_priority_waiting' }, 10_000, duration),
      /next try in 3s · attempt 2/)
    assert.match(describeRetryStatus({ ...retry, kind: 'auto_mode_unavailable' }, 10_000, duration),
      /attempt 2\/4/)
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
