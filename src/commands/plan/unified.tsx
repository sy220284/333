import type { LocalJSXCommandCall } from '../../types/command.js'

/** 本地规划统一入口，跨模型复核统一由 /review 明确触发。 */
export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const text = args.trim()
  if (/^advisor(?:\s|$)/i.test(text)) {
    onDone('已移除服务端顾问。需要交叉复核请使用 /review cross <模型> [deep|security] [PR编号]')
    return null
  }
  if (text === 'help') {
    onDone('用法：/plan [描述] 进入本地规划模式；/plan open 编辑计划；/review cross <模型> 执行可选交叉复核。')
    return null
  }
  const original = await import('./plan.js')
  return original.call(onDone, context, args)
}
