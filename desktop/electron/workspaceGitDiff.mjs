/** Worktree diff shown by the desktop project panel.
 * git diff excludes untracked files, so include their names explicitly while
 * avoiding accidental inclusion of local secrets or huge unversioned contents. */
export function formatWorkspaceGitDiff(unstaged, staged, untrackedNullSeparated) {
  const names = untrackedNullSeparated.split('\0').filter(Boolean)
  const sections = []
  if (unstaged.trim()) sections.push(`未暂存修改\n${unstaged}`)
  if (staged.trim()) sections.push(`已暂存修改（Index）\n${staged}`)
  if (names.length) {
    const visible = names.slice(0, 200).map(name => {
      const safe = [...name].map(char => {
        const code = char.codePointAt(0)
        return code !== undefined && (code < 32 || code === 127) ? '?' : char
      }).join('')
      return `  ${safe}`
    })
    if (names.length > 200) visible.push(`  另有 ${names.length - 200} 个未跟踪文件`)
    sections.push(`未跟踪文件（仅列出文件名，Git 尚无补丁）\n${visible.join('\n')}`)
  }
  return sections.join('\n\n') || '当前工作区无已暂存、未暂存或未跟踪的 Git 改动'
}
