import { isAbsolute, relative, sep } from 'node:path'

export type SymlinkPermissionOperation = 'read' | 'write' | 'create'

/**
 * Display the canonical target before the user accepts a filesystem permission.
 * For a read prompt, the target matters just as much as for an edit prompt:
 * the visible path can otherwise conceal a file outside the workspace.
 */
export function formatSymlinkPermissionWarning(
  target: string,
  operation: SymlinkPermissionOperation,
  workingDirectory: string,
): string {
  const rel = relative(workingDirectory, target)
  const outsideWorkspace =
    rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
  const action = operation === 'read' ? '读取' : '修改'
  return outsideWorkspace
    ? `此操作将通过符号链接${action}工作目录之外的文件：${target}`
    : `符号链接实际${action}位置：${target}`
}
