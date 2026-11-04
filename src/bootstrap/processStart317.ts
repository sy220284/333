import { createRequire } from 'node:module'
const nativeRequire = createRequire(import.meta.url)

// Original 2.1.317: chunk-c3eav5v2.js (startup memory tuning)
// and chunk-51t2xkvt.js (remote-runner GC profiling).
const tuningNames = [
  'BUN_GC_TIMER_INTERVAL', 'MIMALLOC_PURGE_HOLES_MIN_INTERVAL',
  'BUN_IDLE_GC_SECONDS', 'MIMALLOC_PURGE_DELAY',
  'BUN_JSC_useFTLJIT', 'BUN_JSC_percentCPUPerMBForEdenTimer',
  'BUN_JSC_percentCPUPerMBForFullTimer',
]
const falseWords = new Set(['', '0', 'false', 'no', 'off'])
const GC_SAMPLE_MAX_MS = 3_600_000
let tuningNoted = false
let namesMask
let purgeDelay
let timerDisabled

export function noteProcessStartTuning(env = process.env) : void {
  if (tuningNoted) return
  tuningNoted = true
  let names = 0
  for (const [i, key] of tuningNames.entries()) {
    if (env[key]) names |= 1 << i
  }
  const rawPurge = env.MIMALLOC_PURGE_DELAY
  namesMask = names
  purgeDelay = rawPurge !== undefined && /^\d{1,7}$/.test(rawPurge)
    ? Number(rawPurge) : undefined
  const rawTimer = env.BUN_GC_TIMER_DISABLE
  timerDisabled = rawTimer !== undefined && !falseWords.has(rawTimer.toLowerCase())
}

export function processStartTuning() { return namesMask }
export function processStartPurgeDelayMs() { return purgeDelay }
export function processStartCollectionTimerOff() { return timerDisabled }

let countingStarted = false
let firstMessage
let firstMessageProfiler
let finalResultProfiler
let deadline

function finish(profiler) {
  if (!profiler) return
  try {
    const stats = profiler.stop().statistics
      .filter(item => item.gcType === 'Scavenge' || item.gcType === 'MarkSweepCompact')
    const young = stats.filter(item => item.gcType === 'Scavenge').length
    const heapSize = stats.at(-1)?.afterGC?.heapStatistics?.usedHeapSize
    const result = {
      eden: young,
      full: stats.length - young,
      wall_ms: Math.round(stats.reduce((total, item) => total + item.cost, 0) / 1000),
      ...(heapSize === undefined ? {} : { heap_after_mib: Math.round(heapSize / 1048576) }),
    }
    if (Object.values(result).every(Number.isSafeInteger)) return result
  } catch {
    // A profiler can be unavailable after process teardown.
  }
}

export function startGarbageCollectionCount(env = process.env) : void {
  if (countingStarted) return
  countingStarted = true
  if (env.CLAUDE_CODE_REMOTE !== 'true' || env.CLAUDE_CODE_COUNT_GARBAGE_COLLECTIONS !== '1')
    return
  const { GCProfiler } = nativeRequire('node:v8')
  if (typeof GCProfiler !== 'function')
    throw Error('GCProfiler is unavailable for remote 2.1.317 execution')
  firstMessageProfiler = new GCProfiler()
  finalResultProfiler = new GCProfiler()
  firstMessageProfiler.start()
  finalResultProfiler.start()
  deadline = setTimeout(() => { takeGarbageCollectionCount() }, GC_SAMPLE_MAX_MS)
  deadline.unref()
}

export function noteFirstMessageForGarbageCollectionCount() : void {
  firstMessage ??= finish(firstMessageProfiler)
  firstMessageProfiler = undefined
}

export function takeGarbageCollectionCount() {
  const first = firstMessage
  clearTimeout(deadline)
  finish(firstMessageProfiler)
  const last = finish(finalResultProfiler)
  firstMessage = undefined
  firstMessageProfiler = undefined
  finalResultProfiler = undefined
  deadline = undefined
  return last ? { ...(first ? { to_first_message: first } : {}), to_first_result: last } : undefined
}
