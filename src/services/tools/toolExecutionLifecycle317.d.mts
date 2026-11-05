export declare function withToolInProgress<T>(
  setInProgressToolUseIDs: (update: (previous: Set<string>) => Set<string>) => void,
  id: string,
  createStream: () => AsyncGenerator<T, void, unknown>,
): AsyncGenerator<T, void, unknown>
