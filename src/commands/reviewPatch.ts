/**
 * Checks whitespace defects directly in the GitHub PR's unified patch.
 * Git's working-tree diff describes a different change set and cannot
 * validate the actual pull request being reviewed.
 */
export function checkPullRequestPatch(patch: string): string[] {
  const findings: string[] = []
  let currentFile = ''
  let nextNewLine = 0
  for (const raw of patch.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const file = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
    if (file) {
      currentFile = file[2] ?? ''
      nextNewLine = 0
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      nextNewLine = Number(hunk[1])
      continue
    }
    if (!nextNewLine) continue
    if (line.startsWith('+++') && line.includes(' b/')) continue
    if (line.startsWith('+')) {
      const added = line.slice(1)
      if (/[ \t]+$/.test(added)) findings.push(`${currentFile}:${nextNewLine}: 行尾空白`)
      if (/^(?:<{7}|={7}|>{7})(?: |$)/.test(added)) {
        findings.push(`${currentFile}:${nextNewLine}: 未解决的合并冲突标记`)
      }
      nextNewLine++
    } else if (line.startsWith(' ')) {
      nextNewLine++
    } else if (line.startsWith('-')) {
      // Removed lines do not advance the new-file line counter.
    } else if (line.startsWith('\\ No newline at end of file')) {
      // Marker following an added or deleted final line.
    } else {
      nextNewLine = 0
    }
  }
  return findings
}
