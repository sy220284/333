export declare function computeAutoDependencyOrphans(
  installations: Record<string, Array<{ scope: string; projectPath?: string; auto?: boolean; version?: string }>>,
  loaded: Array<{ source: string; manifest?: { dependencies?: string[] } }>,
  scope: string,
  projectPath?: string,
): { orphans: Set<string>; unloadable: string[]; autoCount: number }
