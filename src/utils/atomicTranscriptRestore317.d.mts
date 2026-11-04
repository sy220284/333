export type TranscriptRestoreIO317 = {
  copyFile: (source: string, destination: string, mode?: number) => Promise<void>
  rename: (source: string, destination: string) => Promise<void>
  unlink: (path: string) => Promise<void>
  writeFile: (path: string, content: string, options: { encoding: 'utf8'; mode: number; flag: 'wx' }) => Promise<void>
}
export type TranscriptRestoreEntry317 = { path: string; content: string }

export declare function replaceTranscriptAtomically(
  path: string,
  content: string,
  io?: TranscriptRestoreIO317,
): Promise<void>
export declare function replaceTranscriptBatchAtomically(
  entries: ReadonlyArray<TranscriptRestoreEntry317>,
  io?: TranscriptRestoreIO317,
): Promise<void>
export declare function assertSafeAgentTranscriptId(id: unknown): string
