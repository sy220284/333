export declare function transcriptDestinationKey(path: string): string
export declare function withTranscriptDestinationLocks<T>(
  paths: readonly string[],
  operation: () => Promise<T> | T,
): Promise<T>
