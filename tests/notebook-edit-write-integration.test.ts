import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolUseContext } from '../src/Tool.js'

const makeNotebook = () => ({
  nbformat: 4, nbformat_minor: 5,
  metadata: { language_info: { name: 'python' }, custom: 'keep' },
  cells: [
    { cell_type: 'code', id: 'actual-id', source: ['print(1)\n'], metadata: { tags: ['keep'] }, execution_count: 4, outputs: [{ output_type: 'stream', text: '1\n' }] },
    { cell_type: 'markdown', id: 'second', source: '# Heading', metadata: {} },
  ],
})

// Windows cold-loads the production NotebookEditTool module and its native adapters
// inside this test. Give that real initialization and disk I/O a bounded budget;
// keep imports after disabling checkpointing to preserve production behavior.
test('actual NotebookEditTool validates, edits, inserts and deletes cells on disk', async () => {
  const previous = process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING
  const originalRemovalFlag = process.env.CLAUDE_CODE_AUTO_MODE_EDIT_REMOVAL
  process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING = '1'
  process.env.CLAUDE_CODE_AUTO_MODE_EDIT_REMOVAL = '0'
  const dir = mkdtempSync(join(tmpdir(), 'm1-notebook-'))
  const notebook_path = join(dir, 'real.ipynb')
  try {
    const { NotebookEditTool } = await import('../src/tools/NotebookEditTool/NotebookEditTool.ts')
    expect(NotebookEditTool.toAutoClassifierInput({
      notebook_path, cell_id: 'cell-0', new_source: 'print(2)',
    })).toBe(`${notebook_path} replace: print(2)`)
    process.env.CLAUDE_CODE_AUTO_MODE_EDIT_REMOVAL = '1'
    expect(NotebookEditTool.toAutoClassifierInput({
      notebook_path, cell_id: 'cell-0', new_source: 'print(2)',
    })).toEqual({
      notebook_path, mode: 'replace', cell_id: 'cell-0', adds: 'print(2)',
    })
    expect(NotebookEditTool.toAutoClassifierInput({
      notebook_path, cell_id: 'actual-id', new_source: '', edit_mode: 'delete',
    })).toEqual({
      notebook_path, mode: 'delete', cell_id: 'actual-id', ignored_source: '',
    })
    const { getFileModificationTime } = await import('../src/utils/file.js')
    writeFileSync(notebook_path, JSON.stringify(makeNotebook()))
    const readFileState = new Map()
    const context = { readFileState, updateFileHistoryState: () => {} } as unknown as ToolUseContext
    const markRead = () => readFileState.set(notebook_path, { timestamp: getFileModificationTime(notebook_path), content: readFileSync(notebook_path, 'utf8'), offset: undefined, limit: undefined })
    const perform = async (input: { notebook_path: string; cell_id?: string; cell_type?: 'code' | 'markdown'; new_source: string; edit_mode?: 'insert' | 'replace' | 'delete' }) =>
      NotebookEditTool.call(input, context, undefined, { uuid: 'notebook-test' } as never)
    markRead()
    const edited = { notebook_path, cell_id: 'cell-0', new_source: 'print(2)' }
    expect((await NotebookEditTool.validateInput(edited, context)).result).toBe(true)
    const first = await perform(edited)
    expect(first.data.error).toBe('')
    expect(first.data.cell_id).toBe('cell-0')
    expect(first.data.old_source).toBe('print(1)\n')
    expect(first.data.cell_type).toBe('code')
    expect(JSON.parse(readFileSync(notebook_path, 'utf8')).cells[0].source).toBe('print(2)')

    const inserted = await perform({ notebook_path, cell_id: 'actual-id', cell_type: 'markdown', new_source: 'inserted', edit_mode: 'insert' })
    expect(inserted.data.error).toBe('')
    expect(inserted.data.cell_id).toMatch(/^[0-9a-f]{8}$/)
    let after = JSON.parse(readFileSync(notebook_path, 'utf8'))
    expect(after.cells.map((c: { id: string }) => c.id)).toEqual(['actual-id', inserted.data.cell_id, 'second'])
    expect(after.metadata.custom).toBe('keep')
    const deleted = await perform({ notebook_path, cell_id: inserted.data.cell_id, new_source: '', edit_mode: 'delete' })
    expect(deleted.data.error).toBe('')
    expect(deleted.data.cell_id).toBe(inserted.data.cell_id)
    expect(deleted.data.old_source).toBe('inserted')
    after = JSON.parse(readFileSync(notebook_path, 'utf8'))
    expect(after.cells.map((c: { id: string }) => c.id)).toEqual(['actual-id', 'second'])

    // Simulate a newer external edit after the model's last Read.
    const external = { ...after, metadata: { external_change: true } }
    writeFileSync(notebook_path, JSON.stringify(external))
    const future = new Date(Date.now() + 60000)
    utimesSync(notebook_path, future, future)
    expect((await NotebookEditTool.validateInput(edited, context)).result).toBe(false)
    const rejected = await perform(edited)
    expect(rejected.data.error).toMatch(/changed since it was read/)
    expect(JSON.parse(readFileSync(notebook_path, 'utf8')).metadata.external_change).toBe(true)

    // A fresh read restores the ability to edit without resetting history.
    markRead()
    const recovered = await perform({ notebook_path, cell_id: 'second', new_source: 'updated' })
    expect(recovered.data.error).toBe('')
    expect(JSON.parse(readFileSync(notebook_path, 'utf8')).cells[1].source).toBe('updated')

    // Two parallel edits with the same original Read must be serialized.
    // The second request cannot borrow the refreshed state from the first.
    markRead()
    const concurrent = await Promise.all([
      perform({ notebook_path, cell_id: 'second', new_source: 'first-wins' }),
      perform({ notebook_path, cell_id: 'second', new_source: 'second-must-retry' }),
    ])
    expect(concurrent[0].data.error).toBe('')
    expect(concurrent[1].data.error).toMatch(/concurrent edit/)
    expect(JSON.parse(readFileSync(notebook_path, 'utf8')).cells[1].source).toBe('first-wins')

    // The model-facing schema cannot submit internal write state.
    expect(NotebookEditTool.inputSchema.safeParse({ ...edited, _allowStale: true }).success).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    if (previous === undefined) delete process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING
    else process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING = previous
    if (originalRemovalFlag === undefined) delete process.env.CLAUDE_CODE_AUTO_MODE_EDIT_REMOVAL
    else process.env.CLAUDE_CODE_AUTO_MODE_EDIT_REMOVAL = originalRemovalFlag
  }
}, 30_000)
