import * as React from 'react'
import { useState } from 'react'
import { Box, Text, useAnimationFrame } from '../../ink.js'
import { isScreenReaderEnabled } from '../../utils/accessibility/screenReaderRuntime.js'
import { getInitialSettings } from '../../utils/settings/settings.js'

/** Avenlo fixed-width animated mark; respects reduced motion and scrollback pausing. */
export function AnimatedBrandMark(): React.ReactNode {
  const [reduceMotion] = useState(() => getInitialSettings().prefersReducedMotion ?? false)
  const screenReader = isScreenReaderEnabled()
  const [ref, elapsed] = useAnimationFrame(reduceMotion || screenReader ? null : 120)
  if (screenReader) return null
  const frames = ['│  Avenlo  │', '│ ·Avenlo· │', '│  Avenlo  │'] as const
  const active = reduceMotion ? 0 : Math.floor(elapsed / 480) % frames.length
  return (
    <Box ref={ref} flexDirection="column" flexShrink={0} width={12} height={3}>
      <Text color="professionalBlue">╭──────────╮</Text>
      <Text color="professionalBlue" bold>{frames[active]}</Text>
      <Text color="professionalBlue">╰──────────╯</Text>
    </Box>
  )
}
