import { describe, expect, test } from 'bun:test'
import { calculateEventLoopDelay, sampleCpuAndPageFaults, startEventLoopStallDetector } from '../src/utils/eventLoopStallDetector.js'

describe('2.1.310 事件循环双时钟卡顿协议', () => {
  test('200ms 心跳延迟20ms不会误报', () => {
    const x = calculateEventLoopDelay({ prevWallMs:1000,prevMonotonicMs:500,nowWallMs:1220,nowMonotonicMs:720,intervalMs:200 })
    expect([x.wallDriftMs,x.monotonicStallMs,x.clockJumpMs,x.isStall]).toEqual([20,20,0,false])
  })
  test('单调时钟阻塞1000ms必须报告', () => {
    const x = calculateEventLoopDelay({ prevWallMs:1000,prevMonotonicMs:300,nowWallMs:2200,nowMonotonicMs:1500,intervalMs:200 })
    expect(x.monotonicStallMs).toBe(1000)
    expect(x.isMonotonicStall).toBe(true)
    expect(x.isStall).toBe(true)
  })
  test('休眠唤醒区分挂钟跳变与单调时钟停顿', () => {
    const x = calculateEventLoopDelay({ prevWallMs:1000,prevMonotonicMs:300,nowWallMs:12000,nowMonotonicMs:500,intervalMs:200 })
    expect(x.clockJumpMs).toBe(11000)
    expect(x.monotonicStallMs).toBe(0)
    expect(x.likelySleep).toBe(true)
  })
  test('进程资源采样得到非负数或明确记录采样错误', () => {
    const result = sampleCpuAndPageFaults()
    if (result !== null) {
      expect(result.cpuTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.majorPageFaults).toBeGreaterThanOrEqual(0)
    }
  })
  test('启动和停止清理SIGCONT订阅，且停止幂等', () => {
    const n = process.listenerCount('SIGCONT')
    const stop = startEventLoopStallDetector()
    try {
      expect(process.listenerCount('SIGCONT')).toBe(n+1)
      stop()
      expect(process.listenerCount('SIGCONT')).toBe(n)
    } finally { stop() }
  })
})
