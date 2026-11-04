/**
 * Git comparison contract shared by interactive /ultrareview and standalone CLI.
 * The native 2.1.317 fallback needs explicit consent before submitting an
 * unrelated-history, full-tree snapshot to a cloud session.
 */
export async function resolveUltrareviewGitBase(branch: string, runGit) {
  const merged = await runGit(['merge-base', branch, 'HEAD'])
  const commonBase = merged.stdout.trim()
  if (merged.code === 0 && commonBase) {
    return { kind: 'common', base: commonBase, forceAllFiles: false }
  }
  const head = await runGit(['rev-parse', '--verify', 'HEAD^{commit}'])
  if (head.code !== 0 || !head.stdout.trim()) {
    return { kind: 'no-commits' }
  }
  const empty = await runGit(['hash-object', '-t', 'tree', '--stdin'], '')
  const emptyBase = empty.stdout.trim()
  if (empty.code !== 0 || !/^[a-f0-9]{40,64}$/.test(emptyBase)) {
    return { kind: 'invalid-empty-tree' }
  }
  return { kind: 'all-files', base: emptyBase, forceAllFiles: true }
}
