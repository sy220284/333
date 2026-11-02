import { randomUUID } from 'node:crypto'
import type { NotebookCell, NotebookContent } from '../../types/notebook.js'

export type NotebookEditMode = 'replace' | 'insert' | 'delete'
export type EditableCellType = 'code' | 'markdown'

export interface NotebookMutationInput {
  cell_id?: string
  cell_type?: EditableCellType
  new_source: string
  edit_mode?: NotebookEditMode
}

export interface NotebookMutationResult {
  cell_id: string
  cell_type: NotebookCell['cell_type']
  edit_mode: NotebookEditMode
  cell_index: number
}

/**
 * Share the exact target lookup between validation and the write path.
 * A synthetic cell-N refers to a position only when no real cell has that ID.
 */
export function locateNotebookEdit(
  notebook: NotebookContent,
  input: NotebookMutationInput,
): { mode: NotebookEditMode; index: number } {
  if (
    !notebook ||
    !Array.isArray(notebook.cells) ||
    !notebook.metadata ||
    typeof notebook.metadata !== 'object' ||
    !Number.isInteger(notebook.nbformat) ||
    !Number.isInteger(notebook.nbformat_minor)
  ) {
    throw new Error('Notebook is missing required nbformat, metadata, or cells fields.')
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
    const id = hasIds ? randomUUID() : undefined
    const cell: NotebookCell = {
      cell_type,
      ...(id ? { id } : {}),
      source: input.new_source,
      metadata: {},
      ...(cell_type === 'code' ? { execution_count: null, outputs: [] } : {}),
    }
    notebook.cells.splice(index, 0, cell)
    return {
      cell_id: id ?? `cell-${index}`,
      cell_type,
      edit_mode: mode,
      cell_index: index,
    }
  }

  const cell = notebook.cells[index]
  if (!cell) throw new Error('Target cell no longer exists in notebook.')
  const originalId = cell.id ?? `cell-${index}`
  const originalType = cell.cell_type

  if (mode === 'delete') {
    notebook.cells.splice(index, 1)
    return {
      cell_id: originalId,
      cell_type: originalType,
      edit_mode: mode,
      cell_index: index,
    }
  }

  const cell_type = input.cell_type ?? originalType
  cell.source = input.new_source
  cell.cell_type = cell_type
  if (cell_type === 'code') {
    cell.execution_count = null
    cell.outputs = []
  } else {
    delete cell.execution_count
    delete cell.outputs
  }
  return {
    cell_id: originalId,
    cell_type,
    edit_mode: mode,
    cell_index: index,
  }
}
