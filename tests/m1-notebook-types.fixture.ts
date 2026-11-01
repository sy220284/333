/**
 * M1 缺失 Notebook 类型的正反向类型契约用例。
 * 运行：tsc --strict --noEmit --skipLibCheck --target ES2023
 *       --module ESNext --moduleResolution Bundler tests/m1-notebook-types.fixture.ts
 */
import type {
  NotebookCell,
  NotebookCellOutput,
  NotebookCellSource,
  NotebookContent,
} from '../src/types/notebook.js'

const notebook: NotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { language_info: { name: 'python' } },
  cells: [
    { cell_type: 'code', source: 'print(1)', metadata: {}, execution_count: null, outputs: [] },
    { cell_type: 'markdown', source: ['# Title'], metadata: {} },
  ],
}
const cell: NotebookCell = notebook.cells[0]!
cell.cell_type = 'raw'
cell.execution_count = null
cell.outputs = []
const error: NotebookCellOutput = {
  output_type: 'error',
  ename: 'ValueError',
  evalue: 'bad input',
  traceback: ['Traceback'],
}
const rendered: NotebookCellSource = {
  cellType: 'code',
  source: '',
  cell_id: 'cell-0',
  outputs: [{ output_type: 'display_data', image: { image_data: '', media_type: 'image/png' } }],
}

// @ts-expect-error only notebook cell types permitted by nbformat
const unknownCell: NotebookCell = { cell_type: 'svg', source: '', metadata: {} }
// @ts-expect-error error output must include traceback
const brokenError: NotebookCellOutput = { output_type: 'error', ename: 'Error', evalue: 'bad' }
const invalidImage: NotebookCellSource = {
  cellType: 'code', source: '', cell_id: 'cell-1',
  // @ts-expect-error model tool image content cannot use GIF MIME
  outputs: [{ output_type: 'display_data', image: { image_data: '', media_type: 'image/gif' } }],
}
// Real nbformat rich media includes structured JSON, not just plain text/image bytes.
const richOutput: NotebookCellOutput = {
  output_type: 'display_data',
  data: {
    'text/plain': ['a', 'b'],
    'application/vnd.plotly.v1+json': { series: [1, 2] },
    'image/png': 'aGVsbG8=',
  },
}
const invalidPlainText: NotebookCellOutput = {
  output_type: 'display_data',
  data: {
    // @ts-expect-error text/plain must stay string or string[] for the reader
    'text/plain': { unexpected: true },
  },
}
void [notebook, cell, error, rendered, unknownCell, brokenError, invalidImage, richOutput, invalidPlainText]
