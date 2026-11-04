import type { ToolPermissionContext } from '../../Tool.js'
import { isAbsolute, normalize, parse, sep } from 'node:path'

// 317 chunk-z227w65w al/gCn/ll: exemptions come from flag settings only,
// and must be local absolute non-root paths without traversal or padding.
export function normalizeReadExemptPaths(paths: readonly unknown[]): string[] {
  return paths.flatMap(value => {
    if (typeof value !== 'string' || value.trim() !== value || !isAbsolute(value) || /^[/\\]{2}/.test(value)) return []
    if (value.split(/[/\\]/).includes('..')) return []
    const path = normalize(value)
    if (path === parse(path).root || path.split(sep).includes('..')) return []
    return [path]
  })
}

export function isFileFenceEnabled(layers: readonly ({ permissions?: { blockReadsOutsideWorkingDirectories?: boolean; blockWritesOutsideWorkingDirectories?: boolean } } | null | undefined)[], operation: 'read' | 'write'): boolean {
  const key = operation === 'read' ? 'blockReadsOutsideWorkingDirectories' : 'blockWritesOutsideWorkingDirectories'
  return layers.some(layer => layer?.permissions?.[key] === true)
}

export function fileFenceContext<T extends { additionalWorkingDirectories: ReadonlyMap<string, { source: string }> }>(context: T): T {
  return {
    ...context,
    additionalWorkingDirectories: new Map([...context.additionalWorkingDirectories]
      .filter(([, directory]) => directory.source !== 'projectSettings')),
  }
}

/** 317 olt/rlt/ABr/Xsn: tighten session fences and refresh explicit exemptions. */
export function applyFileFencePolicy(
  context: ToolPermissionContext,
  layers: Parameters<typeof isFileFenceEnabled>[0],
  exemptPaths: readonly unknown[] = [],
): ToolPermissionContext {
  const read = context.blockReadsOutsideWorkingDirectories === true || isFileFenceEnabled(layers, 'read')
  const write = context.blockWritesOutsideWorkingDirectories === true || isFileFenceEnabled(layers, 'write')
  return {
    ...context,
    ...(read && { blockReadsOutsideWorkingDirectories: true }),
    ...(write && {
      blockWritesOutsideWorkingDirectories: true,
      alwaysDenyRules: {
        ...context.alwaysDenyRules,
        toolsNarrowing: [...new Set([...(context.alwaysDenyRules.toolsNarrowing ?? []), 'EnterWorktree', 'ExitWorktree'])],
      },
    }),
    readBlockExemptPaths: normalizeReadExemptPaths(exemptPaths),
  }
}
