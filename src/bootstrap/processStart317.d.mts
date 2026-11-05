export type GarbageCollectionStatistics317 = {
  eden: number
  full: number
  wall_ms: number
  heap_after_mib?: number
}
export declare function noteProcessStartTuning(env?: NodeJS.ProcessEnv): void
export declare function processStartTuning(): number | undefined
export declare function processStartPurgeDelayMs(): number | undefined
export declare function processStartCollectionTimerOff(): boolean | undefined
export declare function startGarbageCollectionCount(env?: NodeJS.ProcessEnv): void
export declare function noteFirstMessageForGarbageCollectionCount(): void
export declare function takeGarbageCollectionCount(): {
  to_first_message?: GarbageCollectionStatistics317
  to_first_result: GarbageCollectionStatistics317
} | undefined
