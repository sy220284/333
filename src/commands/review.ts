import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../commands.js'

import { parseReviewRequest, type ReviewMode } from './reviewMode.js'

const GIT_CONTEXT = `先判断当前工作目录是否为 Git 仓库。
- 带有 PR 编号时，优先读取 gh pr view <编号> 与 gh pr diff <编号>。
- 传入分支或没有 PR 编号时，检查 git status、git diff、git log，确定对比基准和文件范围。
- 不上传仓库内容到任何独立的审查云服务；只使用当前会话已经授权的工具。
- 如无法获取差异，明确说明缺失条件和实际检查过的文件。`

function buildPrompt(mode: ReviewMode, target: string): string {
  const scope = target ? `用户指定的审查目标：${target}` : '审查当前分支尚未合并的变更。'
  if (mode === 'security') {
    return `请在当前工作空间完成**安全审查**。\n${scope}\n${GIT_CONTEXT}
关注新增或变更代码中真实可利用的注入、越权、敏感信息泄露、路径穿越、执行边界和认证问题。
逐项追踪用户输入、权限检查、敏感操作与实际影响；只输出具有明确证据的风险。
每个发现注明严重级别、文件及行号、触发条件、可行利用路径和根因修复建议。
无证据时明确给出已核对范围，不编造风险。此模式全程本地执行。`
  }
  if (mode === 'deep') {
    return `请在当前工作空间完成**深度代码审查**。\n${scope}\n${GIT_CONTEXT}
按三个连续检查轮次执行：
第一轮检查需求与行为、参数、错误传播及主调用链；
第二轮检查跨模块依赖、生命周期、竞争条件、权限和回归风险；
第三轮检查测试覆盖、实际可运行验证与修复闭环。
对每个问题给出文件和行号、根因、复现条件、影响范围与优先级，并核实潜在误报。
保留已有新版能力及相关依赖。报告区分已验证事实和待实测项目。此模式不调用专属云端审查或额外付费服务。`
  }
  return `请在当前工作空间完成**普通代码审查**。\n${scope}\n${GIT_CONTEXT}
检查功能正确性、代码质量、边界条件、性能、测试与基本安全；按严重程度列出具体问题、文件行号与修复建议。
没有发现时说明实际审查范围和验证情况。`
}

const review: Command = {
  type: 'prompt',
  name: 'review',
  description: '统一代码审查入口：普通、深度、安全（均为本地审查）',
  argumentHint: '[normal|deep|security] [PR编号|分支]',
  progressMessage: '正在检查代码变更',
  contentLength: 0,
  source: 'builtin',
  async getPromptForCommand(args): Promise<ContentBlockParam[]> {
    const { mode, target } = parseReviewRequest(args)
    return [{ type: 'text', text: buildPrompt(mode, target) }]
  },
}
export default review
