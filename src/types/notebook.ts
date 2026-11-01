/**
 * Jupyter nbformat 4：只约束 NotebookEditTool、utils/notebook 和差异预览
 * 实际读取或写入的字段。其他 nbformat 扩展字段通过索引签名保留。
 * 来源：2.1.88 src/utils/notebook.ts、
 * src/tools/NotebookEditTool/NotebookEditTool.ts。
 */
export type NotebookCellType = 'code' | 'markdown' | 'raw'
export type NotebookText = string | string[]

export interface NotebookCell {
  cell_type: NotebookCellType
  source: NotebookText
  metadata: Record<string, unknown>
  id?: string
  execution_count?: number | null
  outputs?: NotebookCellOutput[]
  [key: string]: unknown
}

export type NotebookCellOutput =
  | {
      output_type: 'stream'
      text: NotebookText
      name?: string
      [key: string]: unknown
    }
  | {
      output_type: 'execute_result' | 'display_data'
      data?: Record<string, NotebookText>
      execution_count?: number | null
      metadata?: Record<string, unknown>
      [key: string]: unknown
    }
  | {
      output_type: 'error'
      ename: string
      evalue: string
      traceback: string[]
      [key: string]: unknown
    }

export interface NotebookContent {
  cells: NotebookCell[]
  metadata: {
    language_info?: { name?: string; [key: string]: unknown }
    [key: string]: unknown
  }
  nbformat: number
  nbformat_minor: number
  [key: string]: unknown
}

export interface NotebookOutputImage {
  image_data: string
  media_type: 'image/png' | 'image/jpeg'
}

export interface NotebookCellSourceOutput {
  output_type: NotebookCellOutput['output_type']
  text?: string
  image?: NotebookOutputImage
}

export interface NotebookCellSource {
  cellType: NotebookCellType
  source: string
  cell_id: string
  execution_count?: number
  language?: string
  outputs?: (NotebookCellSourceOutput | undefined)[]
}
