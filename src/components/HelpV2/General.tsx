import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { PromptInputHelpMenu } from '../PromptInput/PromptInputHelpMenu.js'

export function General(): React.ReactNode {
  return (
    <Box flexDirection="column" paddingY={1} gap={1}>
      <Box>
        <Text>333 可分析项目代码、经授权修改文件并运行命令，支持多个模型服务商及本地开发流程。</Text>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text bold>快捷键</Text>
        </Box>
        <PromptInputHelpMenu gap={2} fixedWidth={true} />
      </Box>
    </Box>
  )
}
