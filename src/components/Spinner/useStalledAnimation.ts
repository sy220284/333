import { useRef } from 'react'
import { SPINNER_STALL_AFTER_MS, SPINNER_STALL_FADE_MS } from './statusLogic.js'

// Hook to handle the transition to red when tokens stop flowing.
// Driven by the parent's animation clock time instead of independent intervals,
// so it slows down when the terminal is blurred.
export function useStalledAnimation(
  time: number,
  currentResponseLength: number,
  hasActiveTools: boolean = false,
  reducedMotion: boolean = false,
): {
  isStalled: boolean
  stalledIntensity: number
} {
  const lastTokenTime = useRef(time)
  const lastResponseLength = useRef(currentResponseLength)
  const mountTime = useRef(time)
  const stalledIntensityRef = useRef(0)
  const lastSmoothTime = useRef(time)

  // 2.1.310's watchdog resets on actual new output; reducing the counter
  // must not impersonate a freshly received token.
  if (currentResponseLength > lastResponseLength.current) {
    lastTokenTime.current = time
    lastResponseLength.current = currentResponseLength
    mountTime.current = time
    stalledIntensityRef.current = 0
    lastSmoothTime.current = time
  } else if (currentResponseLength < lastResponseLength.current) {
    lastResponseLength.current = currentResponseLength
  }

  // Derive time since last token from animation clock
  let timeSinceLastToken: number
  if (hasActiveTools) {
    timeSinceLastToken = 0
    lastTokenTime.current = time
  } else if (currentResponseLength > 0) {
    timeSinceLastToken = time - lastTokenTime.current
  } else {
    timeSinceLastToken = time - mountTime.current
  }

  // Calculate stalled intensity based on time since last token
  // Target 2.1.310: start warning after 10s without tokens; fade over the next 10s.
  const isStalled = timeSinceLastToken > SPINNER_STALL_AFTER_MS && !hasActiveTools
  const intensity = isStalled
    ? Math.min((timeSinceLastToken - SPINNER_STALL_AFTER_MS) / SPINNER_STALL_FADE_MS, 1) // Fade over the next 10 seconds
    : 0

  // Smooth intensity transition driven by animation frame ticks
  if (!reducedMotion && (intensity > 0 || stalledIntensityRef.current > 0)) {
    const dt = time - lastSmoothTime.current
    if (dt >= 50) {
      const steps = Math.floor(dt / 50)
      let current = stalledIntensityRef.current
      for (let i = 0; i < steps; i++) {
        const diff = intensity - current
        if (Math.abs(diff) < 0.01) {
          current = intensity
          break
        }
        current += diff * 0.1
      }
      stalledIntensityRef.current = current
      lastSmoothTime.current = time
    }
  } else {
    stalledIntensityRef.current = intensity
    lastSmoothTime.current = time
  }

  // When reducedMotion is enabled, use instant intensity change
  const effectiveIntensity = reducedMotion
    ? intensity
    : stalledIntensityRef.current

  return { isStalled, stalledIntensity: effectiveIntensity }
}
