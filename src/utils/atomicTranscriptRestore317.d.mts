export declare function replaceTranscriptAtomically(
  path: string,
  content: string,
): Promise<void>
export declare function replaceTranscriptBatchAtomically(
  entries: ReadonlyArray<{ path: string; content: string }>,
): Promise<void>
export declare function assertSafeAgentTranscriptId(id: unknown): string
