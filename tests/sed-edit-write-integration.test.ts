import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ToolUseContext } from '../src/Tool.js'

// The independent production rebuild maps native NAPI modules to checked-in
// TypeScript/native adapters. Register those same real implementations for
// Bun's direct source-level test loader.
const nativeAdapters: Record<string, string> = {
  'color-diff-napi': '../src/native-ts/color-diff/index.ts',
  'audio-capture-napi': '../native/audio-capture-src/index.ts',
  'image-processor-napi': '../native/image-processor-src/index.ts',
  'modifiers-napi': '../native/modifiers-napi-src/index.ts',
  'url-handler-napi': '../native/url-handler-src/index.ts',
}
Bun.plugin({
  name: 'm1-release-native-adapters',
  setup(build) {
    build.onResolve({ filter: /^(color-diff-napi|audio-capture-napi|image-processor-napi|modifiers-napi|url-handler-napi)$/ }, args => {
      const adapter = nativeAdapters[args.path]
      if (adapter === undefined) throw new Error(`Unknown native adapter: ${args.path}`)
      return { path: resolve(import.meta.dir, adapter) }
    })
  },
})

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
      _simulatedSedEdit: { filePath, oldContent, newContent },
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

    // The model-visible schema cannot supply a pre-approved edit.
    expect(BashTool.inputSchema.safeParse(makeInput('old', 'new')).success).toBe(false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
    if (previous === undefined) delete process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING
    else process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING = previous
  }
})
