import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { PromptInputHelpMenu } from '../PromptInput/PromptInputHelpMenu.js'

export function General(): React.ReactNode {
  return (
    <Box flexDirection="column" paddingY={1} gap={1}>
      <Box>
        Claude 可以理解代码库、经你授权修改文件并执行命令，直接在终端中协助开发。<Text>
          Claude understands your codebase, makes edits with your permission,
          and executes commands — right from your terminal.
        </Text>
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
