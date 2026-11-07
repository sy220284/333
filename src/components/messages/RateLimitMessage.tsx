import React from 'react'
import { Box, Text } from 'src/ink.js'
import { useClaudeAiLimits } from 'src/services/claudeAiLimitsHook.js'
import { MessageResponse } from '../MessageResponse.js'

/** 限流信息面板仅呈现真实服务商状态，不再推送订阅和增购。 */
export function RateLimitMessage({ text }: {
  text: string
  onOpenRateLimitOptions?: () => void
}): React.ReactNode {
  const limits = useClaudeAiLimits()
  return (
    <MessageResponse>
      <Box flexDirection="column">
        <Text color="error">{text}</Text>
        {limits.status === 'rejected' && limits.resetsAt !== undefined && (
          <Text dimColor>当前服务商请求已达到限制；恢复时间取决于服务商账户规则，可在 /status 查看本地用量。</Text>
        )}
      </Box>
    </MessageResponse>
  )
}
