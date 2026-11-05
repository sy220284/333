import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { isScreenReaderEnabled } from '../../utils/accessibility/screenReaderRuntime.js'
import { shouldUseCompactWelcome } from './welcomeLayout.js'

/** 333 branded welcome. Keeps accessible compact text without vendor marketing. */
export function WelcomeV2(): React.ReactNode {
  const { rows } = useTerminalSize()
  if (shouldUseCompactWelcome(rows, isScreenReaderEnabled())) {
    return <Text>欢迎使用 333 v{MACRO.VERSION}</Text>
  }
  return <Box marginX={1} marginY={1} flexDirection="column">
    <Text bold color="professionalBlue">333  ·  AI Coding Agent</Text>
    <Text dimColor>独立多模型编程助手  ·  v{MACRO.VERSION}</Text>
    <Text dimColor>支持多服务商 API、MCP、Agent 与本地任务</Text>
  </Box>
}
