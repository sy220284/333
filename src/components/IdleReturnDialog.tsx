import React from 'react'
import { Box, Text } from '../ink.js'
import { formatTokens } from '../utils/format.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type IdleReturnAction = 'continue' | 'clear' | 'dismiss' | 'never'

type Props = {
  idleMinutes: number
  totalInputTokens: number
  onDone: (action: IdleReturnAction) => void
}

export function IdleReturnDialog({
  idleMinutes,
  totalInputTokens,
  onDone,
}: Props): React.ReactNode {
  const formattedIdle = formatIdleDuration(idleMinutes)
  const formattedTokens = formatTokens(totalInputTokens)

  return (
    <Dialog
      title={`You've been away ${formattedIdle} and this conversation is ${formattedTokens} tokens.`}
      onCancel={() => onDone('dismiss')}
    >
      <Box flexDirection="column">
        如果要开始新任务，清空上下文可以节省用量并提高速度。<Text>
          If this is a new task, clearing context will save usage and be faster.
        </Text>
      </Box>
      <Select
        options={[
          {
            value: 'continue' as const,
            label: '继续当前对话',
          },
          {
            value: 'clear' as const,
            label: '在新对话中发送消息',
          },
          {
            value: 'never' as const,
            label: "不再询问",
          },
        ]}
        onChange={(value: IdleReturnAction) => onDone(value)}
      />
    </Dialog>
  )
}

function formatIdleDuration(minutes: number): string {
  if (minutes < 1) {
    return '< 1m'
  }
  if (minutes < 60) {
    return `${Math.floor(minutes)}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.floor(minutes % 60)
  if (remainingMinutes === 0) {
    return `${hours}h`
  }
  return `${hours}h ${remainingMinutes}m`
}
