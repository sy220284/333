import { isAbsolute, normalize, parse, sep } from 'node:path'

// 317 chunk-z227w65w al/gCn/ll: exemptions come from flag settings only,
// and must be local absolute non-root paths without traversal or padding.
export function normalizeReadExemptPaths(paths) {
  return paths.flatMap(value => {
    if (typeof value !== 'string' || value.trim() !== value || !isAbsolute(value) || /^[/\\]{2}/.test(value)) return []
    if (value.split(/[/\\]/).includes('..')) return []
    const path = normalize(value)
    if (path === parse(path).root || path.split(sep).includes('..')) return []
    return [path]
  })
}

export function isFileFenceEnabled(layers, operation) {
  const key = operation === 'read' ? 'blockReadsOutsideWorkingDirectories' : 'blockWritesOutsideWorkingDirectories'
  return layers.some(layer => layer?.permissions?.[key] === true)
}

export function fileFenceContext(context) {
  return {
    ...context,
    additionalWorkingDirectories: new Map([...context.additionalWorkingDirectories]
      .filter(([, directory]) => directory.source !== 'projectSettings')),
  }
}
