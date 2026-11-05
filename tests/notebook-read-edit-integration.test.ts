import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolUseContext } from '../src/Tool.js'

test('real Read → NotebookEdit → Read shares the same file snapshot and returns edited cells', async () => {
  const originalSimple = process.env.CLAUDE_CODE_SIMPLE
  const originalHistory = process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING
  process.env.CLAUDE_CODE_SIMPLE = '1'
  process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING = '1'

  const directory = mkdtempSync(join(tmpdir(), 'm1-read-edit-notebook-'))
  const notebook_path = join(directory, 'roundtrip.ipynb')
  try {
    const { FileReadTool } = await import('../src/tools/FileReadTool/FileReadTool.ts')
    const { NotebookEditTool } = await import('../src/tools/NotebookEditTool/NotebookEditTool.ts')
    writeFileSync(notebook_path, JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { language_info: { name: 'python' } },
      cells: [{ cell_type: 'code', id: 'real-cell', source: 'print(1)', metadata: {}, execution_count: 1, outputs: [] }],
    }))

    const readFileState = new Map()
    const context = {
      readFileState,
      abortController: new AbortController(),
      updateFileHistoryState: () => {},
      getAppState: () => ({ toolPermissionContext: { additionalWorkingDirectories: [] } }),
    } as unknown as ToolUseContext

    const firstRead = await FileReadTool.call({ file_path: notebook_path }, context)
    expect(firstRead.data.type).toBe('notebook')
    if (firstRead.data.type !== 'notebook') throw new Error('Read failed to parse notebook')
    expect(firstRead.data.file.cells[0]?.source).toBe('print(1)')
    expect(readFileState.get(notebook_path)?.offset).toBe(1)

    const edit = { notebook_path, cell_id: 'cell-0', new_source: 'print(2)' }
    expect((await NotebookEditTool.validateInput(edit, context)).result).toBe(true)
    const updated = await NotebookEditTool.call(edit, context, undefined, { uuid: 'roundtrip' } as never)
    expect(updated.data.error).toBe('')
    expect(updated.data.cell_id).toBe('cell-0')
    expect(readFileState.get(notebook_path)?.offset).toBeUndefined()

    const secondRead = await FileReadTool.call({ file_path: notebook_path }, context)
    expect(secondRead.data.type).toBe('notebook')
    if (secondRead.data.type !== 'notebook') throw new Error('Read returned stale notebook stub')
    expect(secondRead.data.file.cells[0]?.source).toBe('print(2)')
    expect(JSON.parse(readFileSync(notebook_path, 'utf8')).cells[0].source).toBe('print(2)')

    // The range state tracks the latest Read, and subsequent Reads still
    // return complete contents even when the file has not changed.
    expect(readFileState.get(notebook_path)?.offset).toBe(1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
    if (originalSimple === undefined) delete process.env.CLAUDE_CODE_SIMPLE
    else process.env.CLAUDE_CODE_SIMPLE = originalSimple
    if (originalHistory === undefined) delete process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING
    else process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING = originalHistory
  }
}, 90_000)
