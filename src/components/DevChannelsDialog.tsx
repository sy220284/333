import React, { useCallback } from 'react'
import type { ChannelEntry } from '../bootstrap/state.js'
import { Box, Text } from '../ink.js'
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  channels: ChannelEntry[]
  onAccept(): void
}

export function DevChannelsDialog({
  channels,
  onAccept,
}: Props): React.ReactNode {
  function onChange(value: 'accept' | 'exit') {
    switch (value) {
      case 'accept':
        onAccept()
        break
      case 'exit':
        gracefulShutdownSync(1)
        break
    }
  }

  const handleEscape = useCallback(() => {
    gracefulShutdownSync(0)
  }, [])

  return (
    <Dialog
      title="警告：正在加载开发频道"
      color="error"
      onCancel={handleEscape}
    >
      <Box flexDirection="column" gap={1}>
        --dangerously-load-development-channels 仅用于本地频道开发。请勿使用此选项运行从互联网下载的频道。<Text>
          --dangerously-load-development-channels is for local channel
          development only. Do not use this option to run channels you have
          downloaded off the internet.
        </Text>
        <Text>请使用 --channels 运行已批准的频道列表。</Text>
        <Text dimColor>
          频道：{' '}
          {channels
            .map(c =>
              c.kind === 'plugin'
                ? `plugin:${c.name}@${c.marketplace}`
                : `server:${c.name}`,
            )
            .join(', ')}
        </Text>
      </Box>

      <Select
        options={[
          { label: '我确认仅用于本地开发', value: 'accept' },
          { label: '退出', value: 'exit' },
        ]}
        onChange={value => onChange(value as 'accept' | 'exit')}
      />
    </Dialog>
  )
}
