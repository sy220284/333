import type * as React from 'react'
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js'
import { saveLocalFeedback } from '../../services/localRuntime/feedbackReports.js'

/** Local report capture; no report or conversation text is sent to a server. */
export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string = '',
): Promise<React.ReactNode> {
  if (!args.trim()) {
    onDone('使用 /feedback <问题描述> 记录本机反馈，文件保存在 ~/.333/feedback。', { display: 'system' })
    return null
  }
  const path = await saveLocalFeedback(args)
  onDone(`反馈已经保存到本机：${path}`, { display: 'system' })
  return null
}
