export type ReviewGitBase =
  | { kind: 'common'; base: string; forceAllFiles: false }
  | { kind: 'all-files'; base: string; forceAllFiles: true }
  | { kind: 'no-commits' }
  | { kind: 'invalid-empty-tree' }

export declare function resolveUltrareviewGitBase(
  branch: string,
  runGit: (args: string[], input?: string) => Promise<{ stdout: string; code: number }>,
): Promise<ReviewGitBase>
