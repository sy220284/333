/** Jupyter nbformat v4 cell and output structure consumed by NotebookEditTool. */
export type NotebookCellType = 'code' | 'markdown' | 'raw'

export interface NotebookContent {
  nbformat: number
  nbformat_minor: number
  cells: NotebookCell[]
  metadata: {
    language_info?: { name?: string }
    [key: string]: unknown
  }
}

export interface NotebookCell {
  cell_type: NotebookCellType
  id?: string
  source: string | string[]
  metadata: Record<string, unknown>
  execution_count?: number | null
  outputs?: NotebookCellOutput[]
}

type NotebookRichData = Record<string, unknown> & { 'text/plain'?: string | string[] }
export type NotebookCellOutput =
  | { output_type: 'stream'; text: string | string[]; name?: string }
  | { output_type: 'execute_result' | 'display_data'; data?: NotebookRichData; metadata?: Record<string, unknown>; execution_count?: number | null }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] }

export interface NotebookOutputImage {
  image_data: string
  media_type: 'image/png' | 'image/jpeg'
}

/** Normalized output after display truncation and image extraction. */
export interface NotebookCellSourceOutput {
  output_type: NotebookCellOutput['output_type']
  text?: string
  image?: NotebookOutputImage
}

export interface NotebookCellSource {
  cellType: NotebookCellType
  source: string
  execution_count?: number
  cell_id: string
  language?: string
  outputs?: (NotebookCellSourceOutput | undefined)[]
}
