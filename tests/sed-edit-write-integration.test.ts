import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolUseContext } from '../src/Tool.js'

// Exercise the actual BashTool confirmed-edit entry, not only the preview
// helper. Keep the integration isolated from real user configuration.
test('BashTool confirmed sed edit rejects stale content and preserves newer edits', async () => {
  const previous = process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING
  process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING = '1'
  const directory = mkdtempSync(join(tmpdir(), 'm1-sed-write-'))
  const filePath = join(directory, 'example.txt')
  try {
    const { BashTool } = await import('../src/tools/BashTool/BashTool.tsx')
    const context = {
      readFileState: new Map(),
      updateFileHistoryState: () => {},
    } as unknown as ToolUseContext
    const makeInput = (oldContent: string, newContent: string) => ({
      command: "sed -i 's/old/new/' example.txt",
      _simulatedSedEdit: { filePath, oldContent, newContent, targetPath: realpathSync(filePath) },
    })
    writeFileSync(filePath, 'newer external edit\n')
    await expect(
      BashTool.call(makeInput('old preview\n', 'new result\n'), context),
    ).rejects.toThrow(/changed after the sed edit preview/)
    expect(readFileSync(filePath, 'utf8')).toBe('newer external edit\n')

    writeFileSync(filePath, 'old preview\n')
    const result = await BashTool.call(
      makeInput('old preview\n', 'new result\n'),
      context,
    )
    expect(result.data.stderr).toBe('')
    expect(readFileSync(filePath, 'utf8')).toBe('new result\n')

    // An approved preview must stay bound to the actual file target.
    // Equal file contents do not authorize writing to a substituted target.
    const differentFile = join(directory, 'different.txt')
    writeFileSync(differentFile, 'old preview\n')
    const targetSwapped = {
      command: "sed -i 's/old/new/' different.txt",
      _simulatedSedEdit: {
        filePath: differentFile,
        oldContent: 'old preview\n',
        newContent: 'new result\n',
        targetPath: realpathSync(filePath),
      },
    }
    await expect(BashTool.call(targetSwapped, context)).rejects.toThrow(/file target changed/)
    expect(readFileSync(differentFile, 'utf8')).toBe('old preview\n')

    // The model-visible schema cannot supply a pre-approved edit.
    expect(BashTool.inputSchema.safeParse(makeInput('old', 'new')).success).toBe(false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
    if (previous === undefined) delete process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING
    else process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING = previous
  }
})
