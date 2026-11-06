import * as React from 'react'
import { Box, Text } from '../../ink.js'

/** Independent Avenlo identity; used in CLI welcome and compact header. */
export function BrandMark(): React.ReactNode {
  return <Box flexDirection="column" flexShrink={0}>
    <Text bold color="professionalBlue">╭───────╮</Text>
    <Text bold color="professionalBlue">│  Avenlo  │</Text>
    <Text bold color="professionalBlue">╰───────╯</Text>
  </Box>
}
