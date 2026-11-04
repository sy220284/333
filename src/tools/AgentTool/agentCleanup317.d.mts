export declare function releaseAgentResources(
  steps: ReadonlyArray<readonly [name: string, dispose: () => unknown | Promise<unknown>]>,
  primaryFailure?: unknown,
): Promise<void>
