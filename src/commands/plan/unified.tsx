import * as React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'
import advisor from '../advisor.js'

/** 保留原 Plan Mode 和 Advisor 执行器，仅统一命令入口。 */
export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const text = args.trim()
  if (/^advisor(?:\s|$)/i.test(text)) {
    if (!advisor.isEnabled()) {
      onDone('当前模型或环境未启用顾问能力。')
      return null
    }
    const module = await advisor.load()
    const response = await module.call(text.slice('advisor'.length).trim(), context)
    if (response.type === 'text') onDone(response.value)
    else if (response.type === 'compact') onDone(response.displayText)
    return null
  }
  if (text === 'help') {
    onDone('用法：/plan [描述] 进入规划模式；/plan open 编辑计划；/plan advisor <模型> 设置顾问；/plan advisor off 关闭顾问。')
    return null
  }
  const original = await import('./plan.js')
  return original.call(onDone, context, args)
}
