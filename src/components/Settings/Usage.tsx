import * as React from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import { getModelUsage, getTotalInputTokens, getTotalOutputTokens, formatCost } from '../../cost-tracker.js'
import { Box, Text } from '../../ink.js'
import { formatTokens } from '../../utils/format.js'

/** 本地统计所有已使用的模型，保留多模型精确用量。 */
export function Usage({ context }: { context?: LocalJSXCommandContext } = {}): React.ReactNode {
  const models = Object.entries(getModelUsage()).sort(([a], [b]) => a.localeCompare(b))
  const activeModel = context?.getAppState().mainLoopModel
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>模型用量（当前会话）</Text>
      <Text dimColor>当前模型：{activeModel ?? '未确定'}；输入 {formatTokens(getTotalInputTokens())}，输出 {formatTokens(getTotalOutputTokens())} Token</Text>
      {models.length === 0 && <Text dimColor>暂无已记录的模型请求。</Text>}
      {models.map(([model, usage]) => (
        <Box key={model} flexDirection="column">
          <Text bold>{model}{model === activeModel ? ' · 当前' : ''}</Text>
          <Text>输入 {formatTokens(usage.inputTokens)} · 输出 {formatTokens(usage.outputTokens)} · 缓存读取 {formatTokens(usage.cacheReadInputTokens)}</Text>
          <Text>费用 {formatCost(usage.costUSD)} · 上下文上限 {formatTokens(usage.contextWindow)} · 单次输出上限 {formatTokens(usage.maxOutputTokens)}</Text>
        </Box>
      ))}
      <Text dimColor>服务商请求额度依各自账户和 API 策略决定；这里显示本地实际记录及模型上下文限制。</Text>
    </Box>
  )
}
