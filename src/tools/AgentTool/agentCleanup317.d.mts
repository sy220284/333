export declare function releaseAgentResources(
  steps: ReadonlyArray<readonly [name: string, dispose: () => unknown | Promise<unknown>]>,
): Promise<void>
