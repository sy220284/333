import type { NotebookContent } from '../types/notebook.js'

/** Claude Code 2.1.310, chunk-j0tbz6ra.js:58095–58096. */
export const MAX_NOTEBOOK_BYTES = 100 * 1024 * 1024

/** Shared minimum Notebook cell-shape contract for both Read and NotebookEdit. */
export function isValidNotebookContent(value: unknown): value is NotebookContent {
  if (value === null || typeof value !== 'object') return false
  const cells = (value as { cells?: unknown }).cells
  return Array.isArray(cells) && cells.every(cell =>
    cell !== null &&
    typeof cell === 'object' &&
    (typeof cell.source === 'string' ||
      (Array.isArray(cell.source) && cell.source.every((line: unknown) => typeof line === 'string'))),
  )
}
