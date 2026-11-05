export declare function acquireHookPermit(sessionId: string, timeoutMs: number, signal?: AbortSignal): Promise<() => void>
export declare function limitHookGenerator<T>(generator: AsyncGenerator<T>, sessionId: string, timeoutMs: number, signal?: AbortSignal): AsyncGenerator<T>
