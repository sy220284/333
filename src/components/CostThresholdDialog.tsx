import React from 'react'
import { Box, Link, Text } from '../ink.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  onDone: () => void
}

export function CostThresholdDialog({ onDone }: Props): React.ReactNode {
  return (
    <Dialog
      title="本次会话已使用 5 美元 Anthropic API 费用。"
      onCancel={onDone}
    >
      <Box flexDirection="column">
        <Text>了解如何查看和管理费用：</Text>
        <Link url="https://code.claude.com/docs/en/costs" />
      </Box>
      <Select
        options={[
          {
            value: 'ok',
            label: '了解',
          },
        ]}
        onChange={onDone}
      />
    </Dialog>
  )
}
