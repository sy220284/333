export type PollingLifecycle = {
  readonly active: boolean
  schedule(callback: () => void | Promise<void>, delay: number): void
  stop(): void
}
export declare function createPollingLifecycle(timers?: {
  schedule(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  cancel(handle: ReturnType<typeof setTimeout>): void
}): PollingLifecycle
