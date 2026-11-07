import * as React from 'react'
import { Box, Text } from '../../ink.js'

/** Independent 摇摇车 identity; used in CLI welcome and compact header. */
export function BrandMark(): React.ReactNode {
  return <Box flexDirection="column" flexShrink={0}>
    <Text bold color="professionalBlue">╭───────────╮</Text>
    <Text bold color="professionalBlue">│  摇摇车   │</Text>
    <Text bold color="professionalBlue">╰───────────╯</Text>
  </Box>
}
