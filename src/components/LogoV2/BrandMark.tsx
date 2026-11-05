import * as React from 'react'
import { Box, Text } from '../../ink.js'

/** Independent 333 identity; used in CLI welcome and compact header. */
export function BrandMark(): React.ReactNode {
  return <Box flexDirection="column" flexShrink={0}>
    <Text bold color="accent">╭───────╮</Text>
    <Text bold color="accent">│  333  │</Text>
    <Text bold color="accent">╰───────╯</Text>
  </Box>
}
