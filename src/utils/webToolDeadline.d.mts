export declare function withWebToolDeadline<T>(parent: AbortController, operation: (boundedController: AbortController) => Promise<T>, timeoutMs?: number): Promise<T>
