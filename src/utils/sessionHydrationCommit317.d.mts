export declare function commitRestoredSession(
  persist: () => Promise<void>,
  activate: () => void,
): Promise<void>
