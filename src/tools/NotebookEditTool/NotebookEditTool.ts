import { extname, isAbsolute, resolve } from 'node:path'
import {
  fileHistoryEnabled,
  fileHistoryTrackEdit,
} from 'src/utils/fileHistory.js'
import { z } from 'zod/v4'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { buildTool, type ToolDef, type ToolUseContext } from '../../Tool.js'
import type { NotebookContent } from '../../types/notebook.js'
import { getCwd } from '../../utils/cwd.js'
import { isENOENT } from '../../utils/errors.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { processNotebookCellsForRead } from '../../utils/notebook.js'
import { getFileModificationTime, writeTextContent } from '../../utils/file.js'
import { readFileSyncWithMetadata } from '../../utils/fileRead.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { withNotebookFileLock } from '../../utils/notebookFileLock.js'
import { safeParseJSON } from '../../utils/json.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { expandPath } from '../../utils/path.js'
import { checkWritePermissionForTool } from '../../utils/permissions/filesystem.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'
import { NOTEBOOK_EDIT_TOOL_NAME } from './constants.js'
import { applyNotebookEdit, isValidNotebookContent, locateNotebookEdit, MAX_NOTEBOOK_BYTES } from './notebookMutation.js'
import { DESCRIPTION, PROMPT } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
} from './UI.js'

/** A UNC path can access remote shares during stat/read before permission checks. */
function isUncNotebookPath(path: string): boolean {
  return path.startsWith('\\\\\\\\') || path.startsWith('//')
}

export const inputSchema = lazySchema(() =>
  z.strictObject({
    notebook_path: z
      .string()
      .describe(
        'The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)',
      ),
    cell_id: z
      .string()
      .optional()
      .describe(
        'The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.',
      ),
    new_source: z.string().describe('The new source for the cell'),
    cell_type: z
      .enum(['code', 'markdown'])
      .optional()
      .describe(
        'The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.',
      ),
    edit_mode: z
      .enum(['replace', 'insert', 'delete'])
      .optional()
      .describe(
        'The type of edit to make (replace, insert, delete). Defaults to replace.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() =>
  z.object({
    new_source: z
      .string()
      .describe('The new source code that was written to the cell'),
    old_source: z
      .string()
      .optional()
      .describe('Previous source of the replaced or deleted cell'),
    cell_id: z
      .string()
      .optional()
      .describe('The ID of the cell that was edited'),
    cell_type: z.enum(['code', 'markdown']).describe('The type of the cell'),
    language: z.string().describe('The programming language of the notebook'),
    edit_mode: z.string().describe('The edit mode that was used'),
    error: z
      .string()
      .optional()
      .describe('Error message if the operation failed'),
    // Fields for attribution tracking
    notebook_path: z.string().describe('The path to the notebook file'),
    original_file: z
      .string()
      .describe('The original notebook content before modification'),
    updated_file: z
      .string()
      .describe('The updated notebook content after modification'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const NotebookEditTool = buildTool({
  name: NOTEBOOK_EDIT_TOOL_NAME,
  searchHint: 'edit Jupyter notebook cells (.ipynb)',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  userFacingName() {
    return 'Edit Notebook'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `Editing notebook ${summary}` : 'Editing notebook'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  toAutoClassifierInput(input) {
    const mode = input.edit_mode ?? 'replace'
    // 2.1.310 defaults to the readable text classifier transcript. When
    // editRemovalVisibility is enabled, it switches to structured additions
    // and removals. Both branches must carry the edit through permissions.
    const envToggle = process.env.CLAUDE_CODE_AUTO_MODE_EDIT_REMOVAL
    const showRemovals = envToggle === undefined
      ? getFeatureValue_CACHED_MAY_BE_STALE('editRemovalVisibility', false)
      : isEnvTruthy(envToggle)
    if (!showRemovals) {
      return `${input.notebook_path} ${mode}: ${input.new_source}`
    }
    return {
      notebook_path: input.notebook_path,
      mode,
      ...(input.cell_id !== undefined && { cell_id: input.cell_id }),
      ...(mode !== 'delete' && input.cell_type !== undefined && { cell_type: input.cell_type }),
      ...(mode === 'delete'
        ? { ignored_source: input.new_source }
        : { adds: input.new_source }),
    }
  },
  getPath(input): string {
    return input.notebook_path
  },
  backfillObservableInput(input) {
    if (typeof input.notebook_path === 'string') {
      input.notebook_path = expandPath(input.notebook_path)
    }
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkWritePermissionForTool(
      NotebookEditTool,
      input,
      appState.toolPermissionContext,
    )
  },
  mapToolResultToToolResultBlockParam(
    { cell_id, edit_mode, new_source, error },
    toolUseID,
  ) {
    if (error) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: error,
        is_error: true,
      }
    }
    switch (edit_mode) {
      case 'replace':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `Updated cell ${cell_id} with ${new_source}`,
        }
      case 'insert':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `Inserted cell ${cell_id} with ${new_source}`,
        }
      case 'delete':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `Deleted cell ${cell_id}`,
        }
      default:
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: 'Unknown edit mode',
        }
    }
  },
  renderToolUseMessage,
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  async validateInput(
    { notebook_path, cell_type, cell_id, edit_mode = 'replace' },
    toolUseContext: ToolUseContext,
  ) {
    const fullPath = isAbsolute(notebook_path)
      ? notebook_path
      : resolve(getCwd(), notebook_path)

    // Reject UNC paths before any stat/read or permission-side filesystem access.
    if (isUncNotebookPath(notebook_path)) {
      return {
        result: false,
        message: 'UNC notebook paths are not supported.',
        errorCode: 12,
      }
    }

    if (extname(fullPath) !== '.ipynb') {
      return {
        result: false,
        message:
          'File must be a Jupyter notebook (.ipynb file). For editing other file types, use the FileEdit tool.',
        errorCode: 2,
      }
    }

    if (
      edit_mode !== 'replace' &&
      edit_mode !== 'insert' &&
      edit_mode !== 'delete'
    ) {
      return {
        result: false,
        message: 'Edit mode must be replace, insert, or delete.',
        errorCode: 4,
      }
    }

    if (edit_mode === 'insert' && !cell_type) {
      return {
        result: false,
        message: 'Cell type is required when using edit_mode=insert.',
        errorCode: 5,
      }
    }

    // Require Read-before-Edit (matches FileEditTool/FileWriteTool). Without
    // this, the model could edit a notebook it never saw, or edit against a
    // stale view after an external change — silent data loss.
    const readTimestamp = toolUseContext.readFileState.get(fullPath)
    if (!readTimestamp) {
      return {
        result: false,
        message:
          'File has not been read yet. Read it first before writing to it.',
        errorCode: 9,
      }
    }
    // The 2.1.310 tool limits both source and updated notebooks to 100 MiB.
    // Stat before reading: giant notebooks must be rejected without allocating
    // the entire file into a JavaScript string.
    try {
      const stats = getFsImplementation().statSync(fullPath)
      if (stats.size > MAX_NOTEBOOK_BYTES) {
        return {
          result: false,
          message: 'Notebook is too large to edit (maximum 100 MiB).',
          errorCode: 13,
        }
      }
      if (Math.floor(stats.mtimeMs) > readTimestamp.timestamp) {
        return {
          result: false,
          message:
            'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
          errorCode: 10,
        }
      }
    } catch (error) {
      if (isENOENT(error)) {
        return {
          result: false,
          message: 'Notebook file does not exist.',
          errorCode: 1,
        }
      }
      throw error
    }

    let content: string
    try {
      content = readFileSyncWithMetadata(fullPath).content
    } catch (e) {
      if (isENOENT(e)) {
        return {
          result: false,
          message: 'Notebook file does not exist.',
          errorCode: 1,
        }
      }
      throw e
    }
    const notebook = safeParseJSON(content) as NotebookContent | null
    if (!isValidNotebookContent(notebook)) {
      return {
        result: false,
        message: 'Notebook cells are missing or contain invalid source content.',
        errorCode: 6,
      }
    }
    // Read stores a cell projection, while Edit stores raw JSON. Compare
    // both representations so a same-millisecond external edit is detected.
    if (
      readTimestamp.content !== content &&
      readTimestamp.content !== jsonStringify(processNotebookCellsForRead(notebook))
    ) {
      return {
        result: false,
        message: 'Notebook content changed since it was read. Read it again before editing.',
        errorCode: 10,
      }
    }
    try {
      // Validation must use the same lookup semantics as the actual edit.
      // Do not mutate safeParseJSON's memoized object here.
      locateNotebookEdit(notebook, { cell_id, cell_type, new_source: '', edit_mode })
    } catch (error) {
      return {
        result: false,
        message: error instanceof Error ? error.message : 'Invalid notebook edit.',
        errorCode: 7,
      }
    }

    return { result: true }
  },
  async call(
    {
      notebook_path,
      new_source,
      cell_id,
      cell_type,
      edit_mode: originalEditMode,
    },
    { readFileState, updateFileHistoryState },
    _,
    parentMessage,
  ) {
    const fullPath = isAbsolute(notebook_path)
      ? notebook_path
      : resolve(getCwd(), notebook_path)

    // Deny remote UNC paths before resolving the lock key or touching the FS.
    // A direct tool call must be safe even if validation was bypassed.
    if (isUncNotebookPath(notebook_path)) {
      return {
        data: {
          new_source,
          cell_type: cell_type ?? 'code',
          language: 'python',
          edit_mode: originalEditMode ?? 'replace',
          error: 'UNC notebook paths are not supported.',
          cell_id,
          notebook_path: fullPath,
          original_file: '',
          updated_file: '',
        },
      }
    }

    // Capture the caller's view before waiting on the per-file transaction.
    // A second queued edit must not borrow the first edit's refreshed Read state.
    const observedReadState = readFileState.get(fullPath)
    return withNotebookFileLock(fullPath, async () => {
    try {
      if (readFileState.get(fullPath) !== observedReadState) {
        throw new Error(
          'Notebook changed during a concurrent edit. Read it again before editing.',
        )
      }
      if (getFsImplementation().statSync(fullPath).size > MAX_NOTEBOOK_BYTES) {
        throw new Error('Notebook is too large to edit (maximum 100 MiB).')
      }
      // readFileSyncWithMetadata gives content + encoding + line endings in
      // one safeResolvePath + readFileSync pass, replacing the previous
      // detectFileEncoding + readFile + detectLineEndings chain (each of
      // which redid safeResolvePath and/or a 4KB readSync).
      const { content, encoding, lineEndings } =
        readFileSyncWithMetadata(fullPath)
      // Must use non-memoized jsonParse here: safeParseJSON caches by content
      // string and returns a shared object reference, but we mutate the
      // notebook in place below (cells.splice, targetCell.source = ...).
      // Using the memoized version poisons the cache for validateInput() and
      // any subsequent call() with the same file content.
      let notebook: NotebookContent
      try {
        notebook = jsonParse(content) as NotebookContent
      } catch {
        return {
          data: {
            new_source,
            cell_type: cell_type ?? 'code',
            language: 'python',
            edit_mode: originalEditMode ?? 'replace',
            error: 'Notebook is not valid JSON.',
            cell_id,
            notebook_path: fullPath,
            original_file: '',
            updated_file: '',
          },
        }
      }

      // Recheck the read snapshot after permission approval, just before the
      // write. An external edit must never be overwritten by a stale cell ID.
      const snapshot = readFileState.get(fullPath)
      if (!snapshot) {
        throw new Error('File has not been read yet. Read it first before writing to it.')
      }
      if (getFileModificationTime(fullPath) > snapshot.timestamp) {
        throw new Error('Notebook changed since it was read. Read it again before editing.')
      }
      if (
        snapshot.content !== content &&
        snapshot.content !== jsonStringify(processNotebookCellsForRead(notebook))
      ) {
        throw new Error(
          'Notebook content changed since it was read. Read it again before editing.',
        )
      }

      const mutation = applyNotebookEdit(notebook, {
        cell_id,
        cell_type,
        new_source,
        edit_mode: originalEditMode,
      })
      const language = notebook.metadata?.language_info?.name ?? 'python'
      // Write back to file
      const IPYNB_INDENT = 1
      const updatedContent = jsonStringify(notebook, null, IPYNB_INDENT)
      const encodedContent =
        lineEndings === 'CRLF'
          ? updatedContent.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')
          : updatedContent
      if (Buffer.byteLength(encodedContent, encoding) > MAX_NOTEBOOK_BYTES) {
        throw new Error(
          'Edit rejected: the updated notebook exceeds the maximum readable size (100 MiB). The file was left unchanged.',
        )
      }
      if (getFileModificationTime(fullPath) > snapshot.timestamp) {
        throw new Error('Notebook changed during edit preparation. Read it again before editing.')
      }
      if (fileHistoryEnabled()) {
        await fileHistoryTrackEdit(
          updateFileHistoryState,
          fullPath,
          parentMessage.uuid,
        )
      }
      // A checkpoint may take time; guard the write immediately afterwards.
      if (getFileModificationTime(fullPath) > snapshot.timestamp) {
        throw new Error('Notebook changed during checkpointing. Read it again before editing.')
      }
      writeTextContent(fullPath, updatedContent, encoding, lineEndings)
      // Update readFileState with post-write mtime (matches FileEditTool/
      // FileWriteTool). offset:undefined breaks FileReadTool's dedup match —
      // without this, Read→NotebookEdit→Read in the same millisecond would
      // return the file_unchanged stub against stale in-context content.
      readFileState.set(fullPath, {
        content: updatedContent,
        timestamp: getFileModificationTime(fullPath),
        offset: undefined,
        limit: undefined,
      })
      const data = {
        new_source,
        old_source: mutation.old_source,
        cell_type: mutation.cell_type,
        language,
        edit_mode: mutation.edit_mode,
        cell_id: mutation.cell_id,
        error: '',
        notebook_path: fullPath,
        original_file: content,
        updated_file: updatedContent,
      }
      return {
        data,
      }
    } catch (error) {
      if (error instanceof Error) {
        const data = {
          new_source,
          cell_type: cell_type ?? 'code',
          language: 'python',
          edit_mode: originalEditMode ?? 'replace',
          error: error.message,
          cell_id,
          notebook_path: fullPath,
          original_file: '',
          updated_file: '',
        }
        return {
          data,
        }
      }
      const data = {
        new_source,
        cell_type: cell_type ?? 'code',
        language: 'python',
        edit_mode: 'replace',
        error: 'Unknown error occurred while editing notebook',
        cell_id,
        notebook_path: fullPath,
        original_file: '',
        updated_file: '',
      }
      return {
        data,
      }
    }
    })
  },
} satisfies ToolDef<InputSchema, Output>)
