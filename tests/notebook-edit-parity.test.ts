import { expect, test } from 'bun:test'
import { applyNotebookEdit, isValidNotebookContent, locateNotebookEdit, MAX_NOTEBOOK_BYTES } from '../src/tools/NotebookEditTool/notebookMutation.js'
import type { NotebookContent } from '../src/types/notebook.js'

const notebook = (minor = 5): NotebookContent => ({
  nbformat: 4,
  nbformat_minor: minor,
  metadata: { language_info: { name: 'python' }, custom: { preserved: true } },
  cells: [
    { cell_type: 'code', id: minor >= 5 ? 'first' : undefined, source: ['print(1)\n'], metadata: { tags: ['keep'] }, execution_count: 8, outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }] },
    { cell_type: 'markdown', id: minor >= 5 ? 'second' : undefined, source: '# Heading', metadata: { keep: true } },
  ],
})

test('Notebook real cell ID takes precedence over a synthetic cell-N position', () => {
  const nb = notebook()
  const aliasCell = nb.cells[1]
  if (!aliasCell) throw new Error('Missing test cell')
  aliasCell.id = 'cell-0'
  const result = applyNotebookEdit(nb, { cell_id: 'cell-0', new_source: '# New' })
  expect(result.cell_index).toBe(1)
  expect(result.cell_id).toBe('cell-0')
  expect(nb.cells[0]?.source).toEqual(['print(1)\n'])
  expect(nb.cells[1]?.source).toBe('# New')
})

test('Notebook positional replacement preserves the actual stable cell ID', () => {
  const nb = notebook()
  const result = applyNotebookEdit(nb, { cell_id: 'cell-0', new_source: 'print(2)' })
  expect(result.cell_id).toBe('first')
  expect(result.old_source).toBe('print(1)\n')
  expect(nb.cells[0]?.id).toBe('first')
  expect(nb.cells[0]?.execution_count).toBeNull()
  expect(nb.cells[0]?.outputs).toEqual([])
  expect(nb.cells[0]?.metadata.tags).toEqual(['keep'])
})

test('Notebook insert after anchor yields unique nbformat 4.5 ID, keeping neighbor IDs', () => {
  const nb = notebook()
  const a = applyNotebookEdit(nb, { cell_id: 'first', cell_type: 'code', new_source: 'a', edit_mode: 'insert' })
  const b = applyNotebookEdit(nb, { cell_id: a.cell_id, cell_type: 'markdown', new_source: 'b', edit_mode: 'insert' })
  expect(nb.cells.map(c => c.id)).toEqual(['first', a.cell_id, b.cell_id, 'second'])
  expect(a.cell_id).toMatch(/^[0-9a-f]{8}$/)
  expect(b.cell_id).toMatch(/^[0-9a-f]{8}$/)
  expect(b.cell_id).not.toBe(a.cell_id)
  expect(nb.cells[1]?.outputs).toEqual([])
  expect(nb.cells[2]?.outputs).toBeUndefined()
})

test('Notebook insert at start and legacy 4.4 positional IDs', () => {
  const nb = notebook(4)
  const result = applyNotebookEdit(nb, { cell_type: 'markdown', new_source: 'start', edit_mode: 'insert' })
  expect(result.cell_id).toBe('cell-0')
  expect(nb.cells[0]?.id).toBeUndefined()
  expect(nb.cells[0]?.source).toBe('start')
  expect(nb.cells[1]?.source).toEqual(['print(1)\n'])
})

test('Notebook code to markdown conversion drops stale outputs and execution count', () => {
  const nb = notebook()
  const r = applyNotebookEdit(nb, { cell_id: 'first', cell_type: 'markdown', new_source: '## New' })
  expect(r.cell_type).toBe('markdown')
  expect(nb.cells[0]).not.toHaveProperty('outputs')
  expect(nb.cells[0]).not.toHaveProperty('execution_count')
  expect(nb.cells[0]?.metadata).toEqual({ tags: ['keep'] })
})

test('Notebook markdown to code initializes executable fields', () => {
  const nb = notebook()
  applyNotebookEdit(nb, { cell_id: 'second', cell_type: 'code', new_source: 'value=1' })
  expect(nb.cells[1]?.execution_count).toBeNull()
  expect(nb.cells[1]?.outputs).toEqual([])
  expect(nb.cells[1]?.cell_type).toBe('code')
})

test('Notebook delete reports the deleted cell and leaves the other intact', () => {
  const nb = notebook()
  const r = applyNotebookEdit(nb, { cell_id: 'cell-0', new_source: '', edit_mode: 'delete' })
  expect(r).toEqual({ cell_id: 'first', cell_type: 'code', edit_mode: 'delete', cell_index: 0, old_source: 'print(1)\n' })
  expect(nb.cells.map(c => c.id)).toEqual(['second'])
})

test('Notebook raw cells remain valid when editing without converting', () => {
  const nb = notebook()
  const rawCell = nb.cells[1]
  if (!rawCell) throw new Error('Missing test cell')
  rawCell.cell_type = 'raw'
  const r = applyNotebookEdit(nb, { cell_id: 'second', new_source: 'raw data' })
  expect(r.cell_type).toBe('raw')
  expect(nb.cells[1]?.source).toBe('raw data')
  expect(nb.cells[1]).not.toHaveProperty('outputs')
})

test('Notebook rejects missing and out-of-range target IDs without changing cells', () => {
  const nb = notebook()
  const previous = JSON.stringify(nb)
  for (const cell_id of ['cell-99', 'missing', 'cell-99999999999999999999']) {
    expect(() => applyNotebookEdit(nb, { cell_id, new_source: 'bad' })).toThrow(/not found/)
    expect(JSON.stringify(nb)).toBe(previous)
  }
})

test('Notebook replace/delete requires ID; insert requires cell type', () => {
  const nb = notebook()
  expect(() => locateNotebookEdit(nb, { new_source: 'bad' })).toThrow(/Cell ID/)
  expect(() => locateNotebookEdit(nb, { new_source: 'bad', edit_mode: 'delete' })).toThrow(/Cell ID/)
  expect(() => locateNotebookEdit(nb, { new_source: 'bad', edit_mode: 'insert' })).toThrow(/Cell type/)
})

test('Notebook rejects malformed cell metadata/array before mutating', () => {
  const nb = notebook()
  const bad = { ...nb, cells: null } as unknown as NotebookContent
  expect(() => applyNotebookEdit(bad, { cell_type: 'code', new_source: 'x', edit_mode: 'insert' })).toThrow(/valid cells and cell source/)
})

test('Notebook mutation retains document-level metadata and other cells', () => {
  const nb = notebook()
  const previous = structuredClone(nb.cells[1])
  applyNotebookEdit(nb, { cell_id: 'first', new_source: 'print(3)' })
  expect(nb.cells[1]).toEqual(previous)
  expect(nb.metadata.custom).toEqual({ preserved: true })
})

test('2.1.310 notebook cell-source contract accepts missing optional metadata and rejects malformed sources', () => {
  const legacy = { cells: [{ cell_type: 'markdown', source: ['first', 'second'] }] }
  expect(isValidNotebookContent(legacy)).toBe(true)
  const result = applyNotebookEdit(legacy as unknown as NotebookContent, {
    cell_id: 'cell-0', new_source: 'joined',
  })
  expect(result.old_source).toBe('firstsecond')
  expect(isValidNotebookContent({ cells: [{ cell_type: 'markdown', source: [1, 'bad'] }] })).toBe(false)
  expect(isValidNotebookContent({ cells: [null] })).toBe(false)
  expect(isValidNotebookContent({ cells: 'invalid' })).toBe(false)
  expect(MAX_NOTEBOOK_BYTES).toBe(104857600)
})
