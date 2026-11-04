export declare function commitRestoredSession(
  persist: () => Promise<void>,
  activate: () => void,
): Promise<void>

export declare function requireFetchedSessionEntries<T>(entries: T[] | null | undefined): T[]
