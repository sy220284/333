import { randomUUID } from 'node:crypto'
import type { NotebookCell, NotebookContent } from '../../types/notebook.js'
import { isValidNotebookContent } from '../../utils/notebookCells.js'
export { isValidNotebookContent, MAX_NOTEBOOK_BYTES } from '../../utils/notebookCells.js'

export type NotebookEditMode = 'replace' | 'insert' | 'delete'
export type EditableCellType = 'code' | 'markdown'

export interface NotebookMutationInput {
  cell_id?: string
  cell_type?: EditableCellType
  new_source: string
  edit_mode?: NotebookEditMode
}

export interface NotebookMutationResult {
  cell_id?: string
  cell_type: EditableCellType
  edit_mode: NotebookEditMode
  cell_index: number
  old_source?: string
}

/**
 * Share the exact target lookup between validation and the write path.
 * A synthetic cell-N refers to a position only when no real cell has that ID.
 */
export function locateNotebookEdit(
  notebook: NotebookContent,
  input: NotebookMutationInput,
): { mode: NotebookEditMode; index: number } {
  if (!isValidNotebookContent(notebook)) {
    throw new Error('Notebook is missing valid cells and cell source fields.')
  }

  const mode = input.edit_mode ?? 'replace'
  if (mode === 'insert' && !input.cell_type) {
    throw new Error('Cell type is required when using edit_mode=insert.')
  }
  if (!input.cell_id) {
    if (mode !== 'insert') {
      throw new Error('Cell ID must be specified when not inserting a new cell.')
    }
    return { mode, index: 0 }
  }

  let index = notebook.cells.findIndex(cell => cell?.id === input.cell_id)
  if (index < 0) {
    const match = /^cell-(\d+)$/.exec(input.cell_id)
    const parsed = match ? Number(match[1]) : NaN
    if (Number.isSafeInteger(parsed) && parsed >= 0) index = parsed
  }

  const target = notebook.cells[index]
  if (
    index < 0 ||
    index >= notebook.cells.length ||
    !target ||
    !['code', 'markdown', 'raw'].includes(target.cell_type)
  ) {
    throw new Error(`Cell with ID "${input.cell_id}" not found in notebook.`)
  }

  return { mode, index: mode === 'insert' ? index + 1 : index }
}

export function applyNotebookEdit(
  notebook: NotebookContent,
  input: NotebookMutationInput,
): NotebookMutationResult {
  const { mode, index } = locateNotebookEdit(notebook, input)
  const hasIds = notebook.nbformat > 4 ||
    (notebook.nbformat === 4 && notebook.nbformat_minor >= 5)

  if (mode === 'insert') {
    const cell_type = input.cell_type
    if (!cell_type) throw new Error('Cell type is required when using edit_mode=insert.')
    // 2.1.310 uses the first eight characters of a UUID. Keep generated
    // IDs unique within the edited notebook even in the unlikely collision.
    let id: string | undefined
    if (hasIds) {
      do {
        id = randomUUID().slice(0, 8)
      } while (notebook.cells.some(existing => existing.id === id))
    }
    const cell: NotebookCell = {
      cell_type,
      ...(id ? { id } : {}),
      source: input.new_source,
      metadata: {},
      ...(cell_type === 'code' ? { execution_count: null, outputs: [] } : {}),
    }
    notebook.cells.splice(index, 0, cell)
    return {
      cell_id: id,
      cell_type,
      edit_mode: mode,
      cell_index: index,
    }
  }

  const cell = notebook.cells[index]
  if (!cell) throw new Error('Target cell no longer exists in notebook.')
  // The 2.1.310 tool echoes the requested ID for nbformat 4.5+ cells,
  // even when cell-N was used to address a cell with a different real ID.
  // Older notebook formats do not return an ID in this output.
  const returnedId = hasIds ? input.cell_id : undefined
  const originalType = cell.cell_type
  const old_source = Array.isArray(cell.source) ? cell.source.join('') : cell.source

  if (mode === 'delete') {
    notebook.cells.splice(index, 1)
    return {
      cell_id: returnedId,
      cell_type: input.cell_type ?? 'code',
      edit_mode: mode,
      cell_index: index,
      old_source,
    }
  }

  // Official 2.1.310 clears execution state according to the cell's
  // PREVIOUS type. A subsequent type switch keeps the old execution fields.
  // Do not normalize fields after the switch: the target x64 preserves them.
  cell.source = input.new_source
  if (originalType === 'code') {
    cell.execution_count = null
    cell.outputs = []
  }
  if (input.cell_type && input.cell_type !== originalType) {
    cell.cell_type = input.cell_type
  }
  return {
    cell_id: returnedId,
    // 2.1.310's output is based on input.cell_type, defaulting to "code",
    // even when the stored cell was originally markdown or raw.
    cell_type: input.cell_type ?? 'code',
    edit_mode: mode,
    cell_index: index,
    old_source,
  }
}
