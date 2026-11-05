/**
 * Shared cron daemon adapter. The SDK imports the same real scheduler as the
 * interactive CLI, including its per-project lock, jitter, task deletion and
 * missed-task user-consent policy. No second scheduler is maintained here.
 */
import { randomUUID } from 'node:crypto'
import {
  buildMissedTaskNotification as formatMissed,
  createCronScheduler,
} from '../../utils/cronScheduler.js'
import type {
  CronTask,
  CronJitterConfig,
  ScheduledTaskEvent,
  ScheduledTasksHandle,
} from '../agentSdkTypes.js'

const MAX_PENDING_EVENTS = 1024

export function formatMissedDaemonTasks317(missed: CronTask[]): string {
  return formatMissed(missed)
}

export function watchDaemonScheduledTasks317(opts: {
  dir: string
  signal: AbortSignal
  getJitterConfig?: () => CronJitterConfig
}): ScheduledTasksHandle {
  const pending: ScheduledTaskEvent[] = []
  let wake: (() => void) | null = null
  let stopped = opts.signal.aborted
  let consumerCreated = false
  let failure: Error | undefined

  const notify = () => {
    const waiting = wake
    wake = null
    waiting?.()
  }
  const scheduler = createCronScheduler({
    dir: opts.dir,
    lockIdentity: randomUUID(),
    getJitterConfig: opts.getJitterConfig,
    isLoading: () => false,
    onFire: () => {
      // The daemon always requests the full task identity via onFireTask.
      throw new Error('Scheduler discarded task identity in daemon mode')
    },
    onFireTask: task => enqueue({ type: 'fire', task }),
    onMissed: tasks => enqueue({ type: 'missed', tasks }),
  })

  function stop(): void {
    if (stopped) return
    stopped = true
    scheduler.stop()
    opts.signal.removeEventListener('abort', stop)
    notify()
  }

  function enqueue(event: ScheduledTaskEvent): void {
    if (stopped) return
    if (pending.length >= MAX_PENDING_EVENTS) {
      failure = new Error('Scheduled-task event queue exceeded capacity; consumer must drain events')
      stop()
      return
    }
    pending.push(event)
    notify()
  }

  if (!stopped) {
    opts.signal.addEventListener('abort', stop, { once: true })
    scheduler.start()
  }

  return {
    getNextFireTime: () => stopped ? null : scheduler.getNextFireTime(),
    async *events(): AsyncGenerator<ScheduledTaskEvent> {
      if (consumerCreated) throw new Error('Scheduled-task events have one owner')
      consumerCreated = true
      try {
        for (;;) {
          if (failure) throw failure
          if (stopped) return
          const next = pending.shift()
          if (next) {
            yield next
            continue
          }
          await new Promise<void>(resolve => { wake = resolve })
        }
      } finally {
        stop()
      }
    },
  }
}
