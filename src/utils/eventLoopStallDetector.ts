/**
 * Claude Code 2.1.310 event-loop stall detector.
 *
 * The official runtime checks wall and monotonic clocks independently,
 * samples CPU/page faults and memory on stalls, and restores terminal modes
 * after a probable sleep/wake gap. This module is only started by the
 * internal USER_TYPE=ant startup gate in main.tsx.
 *
 * Target: chunk-29abmft5.js -> chunk-k8sjvrbs.js.
 */
import inkInstances from '../ink/instances.js'
import { logEvent } from '../services/analytics/index.js'
import { logForDebugging } from './debug.js'
import { logError } from './log.js'

const NORMAL_INTERVAL_MS = 200
const REMOTE_INTERVAL_MS = 1_000
const MONOTONIC_STALL_THRESHOLD_MS = 500
const SLEEP_THRESHOLD_MS = 5_000
const MEMORY_SAMPLE_INTERVAL_MS = 300_000

export type ProcessResourceSample = {
  cpuTimeMs: number
  majorPageFaults: number
}

export function sampleCpuAndPageFaults(): ProcessResourceSample | null {
  try {
    const sample = process.resourceUsage()
    return {
      cpuTimeMs: (sample.userCPUTime + sample.systemCPUTime) / 1_000,
      majorPageFaults: sample.majorPageFault,
    }
  } catch (error) {
    logError(new Error('event-loop-stall: process.resourceUsage failed', { cause: error }))
    return null
  }
}

export type EventLoopDelay = {
  wallElapsedMs: number
  wallDriftMs: number
  monotonicStallMs: number
  clockJumpMs: number
  isStall: boolean
  isMonotonicStall: boolean
  likelySleep: boolean
}

/** Pure calculation; compares monotonic delay and wall clock separately. */
export function calculateEventLoopDelay(input: {
  prevWallMs: number
  prevMonotonicMs: number
  nowWallMs: number
  nowMonotonicMs: number
  intervalMs: number
}): EventLoopDelay {
  const wallElapsedMs = input.nowWallMs - input.prevWallMs
  const elapsedMonotonic = input.nowMonotonicMs - input.prevMonotonicMs
  const wallDriftMs = wallElapsedMs - input.intervalMs
  const monotonicStallMs = Math.round(elapsedMonotonic - input.intervalMs)
  const clockJumpMs = wallDriftMs - monotonicStallMs
  const isMonotonicStall = monotonicStallMs > MONOTONIC_STALL_THRESHOLD_MS
  return {
    wallElapsedMs,
    wallDriftMs,
    monotonicStallMs,
    clockJumpMs,
    isStall: wallDriftMs > MONOTONIC_STALL_THRESHOLD_MS || isMonotonicStall,
    isMonotonicStall,
    likelySleep: wallDriftMs > SLEEP_THRESHOLD_MS,
  }
}

type Host = {
  /** In hosted worker mode, activity resets the detector to full cadence. */
  subscribeWork?: (callback: () => void) => () => void
}

type DetectorOptions = { attributeSigcont?: boolean }

class EventLoopStallDetector {
  private timer: ReturnType<typeof setInterval> | undefined
  private intervalMs = NORMAL_INTERVAL_MS
  private readonly activeIntervalMs: number
  private readonly restAfterQuietMs: number | undefined
  private readonly restIntervalMs = 10_000
  private quietMs = 0
  private stopWork: () => void = () => {}
  private lastWall = 0
  private lastMonotonic = 0
  private prevResource: ProcessResourceSample | null = null
  private sigcontSeen = false
  private readonly onSigcont = () => { this.sigcontSeen = true }
  private totalStalls = 0
  private wallStallMs = 0
  private monotonicStallMs = 0
  private nextMemorySample = 0
  private started = false

  constructor(
    private readonly host: Host,
    private readonly options: DetectorOptions,
  ) {
    const remote = Boolean(process.env.CLAUDE_CODE_REMOTE)
    this.activeIntervalMs = remote ? REMOTE_INTERVAL_MS : NORMAL_INTERVAL_MS
    this.restAfterQuietMs = remote ? 30_000 : undefined
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.lastWall = Date.now()
    this.lastMonotonic = performance.now()
    this.nextMemorySample = this.lastWall + MEMORY_SAMPLE_INTERVAL_MS
    this.prevResource = sampleCpuAndPageFaults()

    if (this.options.attributeSigcont !== false) {
      process.on('SIGCONT', this.onSigcont)
    }

    if (this.restAfterQuietMs !== undefined && this.host.subscribeWork) {
      this.stopWork = this.host.subscribeWork(() => {
        this.quietMs = 0
        this.arm(this.activeIntervalMs)
      })
    }

    this.arm(this.activeIntervalMs)
    logForDebugging(
      `[event-loop-stall] detector started interval=${this.activeIntervalMs}ms, threshold=${MONOTONIC_STALL_THRESHOLD_MS}ms`,
    )
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.stopWork()
    process.off('SIGCONT', this.onSigcont)
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private arm(ms: number): void {
    if (this.timer && this.intervalMs === ms) return
    if (this.timer) clearInterval(this.timer)
    this.intervalMs = ms
    this.timer = setInterval(() => this.tick(), ms)
    this.timer.unref()
  }

  private tick(): void {
    const nowWall = Date.now()
    const nowMonotonic = performance.now()
    // If the interval was re-armed mid-window, avoid inventing a negative
    // expected duration for the transition tick.
    const expectedInterval = Math.min(
      this.intervalMs,
      Math.round(nowMonotonic - this.lastMonotonic),
    )
    const delay = calculateEventLoopDelay({
      prevWallMs: this.lastWall,
      prevMonotonicMs: this.lastMonotonic,
      nowWallMs: nowWall,
      nowMonotonicMs: nowMonotonic,
      intervalMs: expectedInterval,
    })
    const resource = sampleCpuAndPageFaults()
    const sigcont = this.sigcontSeen
    this.sigcontSeen = false

    if (delay.isStall) {
      this.totalStalls++
      this.wallStallMs += Math.max(0, delay.wallDriftMs)
      if (delay.isMonotonicStall) {
        this.monotonicStallMs += delay.monotonicStallMs
      }
      const cpu = resource && this.prevResource
        ? {
            cpu_delta_ms: Math.round(resource.cpuTimeMs - this.prevResource.cpuTimeMs),
            major_fault_delta: resource.majorPageFaults - this.prevResource.majorPageFaults,
          }
        : undefined
      const used = process.memoryUsage()
      const memory = {
        rss_mb: Math.round(used.rss / 1024 / 1024),
        heap_used_mb: Math.round(used.heapUsed / 1024 / 1024),
        ext_mb: Math.round(used.external / 1024 / 1024),
      }
      // Defer I/O until after the tick clock has been reset.
      setImmediate(() => {
        logForDebugging(
          `[event-loop-stall] blocked ${delay.monotonicStallMs}ms monotonic; wall drift ${delay.wallDriftMs}ms, clock jump ${delay.clockJumpMs}ms, cumulative ${this.wallStallMs}ms`,
        )
        logEvent('tengu_event_loop_stall', {
          stall_duration_ms: delay.wallDriftMs,
          expected_interval_ms: expectedInterval,
          actual_interval_ms: delay.wallElapsedMs,
          monotonic_stall_ms: delay.monotonicStallMs,
          clock_jump_ms: delay.clockJumpMs,
          total_stalls: this.totalStalls,
          cumulative_stall_ms: this.wallStallMs,
          cumulative_monotonic_stall_ms: this.monotonicStallMs,
          likely_sleep: delay.likelySleep,
          sigcont,
          ...cpu,
          ...memory,
        })
      })
      if (delay.likelySleep) {
        inkInstances.get(process.stdout)?.reassertTerminalModes()
      }
    } else if (nowWall >= this.nextMemorySample) {
      this.nextMemorySample = nowWall + MEMORY_SAMPLE_INTERVAL_MS
    }

    this.lastWall = nowWall
    this.lastMonotonic = nowMonotonic
    this.prevResource = resource

    if (this.restAfterQuietMs !== undefined && this.host.subscribeWork) {
      this.quietMs += this.intervalMs
      if (this.quietMs >= this.restAfterQuietMs) this.arm(this.restIntervalMs)
    }
  }
}

let activeDetector: EventLoopStallDetector | undefined

/**
 * Start once per process. The stop callback is also usable by isolated tests;
 * production startup invokes this only in the internal-gated code branch.
 */
export function startEventLoopStallDetector(
  host: Host = {},
  options: DetectorOptions = {},
): () => void {
  if (!activeDetector) {
    activeDetector = new EventLoopStallDetector(host, options)
    activeDetector.start()
  }
  const detector = activeDetector
  return () => {
    if (activeDetector === detector) {
      detector.stop()
      activeDetector = undefined
    }
  }
}
