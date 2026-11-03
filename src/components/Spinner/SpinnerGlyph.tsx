import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Box, Text, useTheme } from '../../ink.js';
import { getTheme, type Theme } from '../../utils/theme.js';
import { getDefaultCharacters, interpolateColor, parseRGB, toRGBColor } from './utils.js';
const DEFAULT_CHARACTERS = getDefaultCharacters();
const SPINNER_FRAMES = [...DEFAULT_CHARACTERS, ...[...DEFAULT_CHARACTERS].reverse()];
const REDUCED_MOTION_DOT = '●';
const REDUCED_MOTION_CYCLE_MS = 2000; // 2-second cycle: 1s visible, 1s dim
const ERROR_RED = {
  r: 171,
  g: 43,
  b: 63
};
type Props = {
  frame: number;
  messageColor: keyof Theme;
  stalledIntensity?: number;
  thinkingIntensity?: number;
  reducedMotion?: boolean;
  time?: number;
};
export function SpinnerGlyph(t0) {
  const $ = _c(9);
  const {
    frame,
    messageColor,
    stalledIntensity: t1,
    thinkingIntensity: t4,
    reducedMotion: t2,
    time: t3
  } = t0;
  const stalledIntensity = t1 === undefined ? 0 : t1;
  const thinkingIntensity = t4 === undefined ? 0 : t4;
  const reducedMotion = t2 === undefined ? false : t2;
  const time = t3 === undefined ? 0 : t3;
  const [themeName] = useTheme();
  const theme = getTheme(themeName);
  if (reducedMotion) {
    // Target 2.1.310: a 2s cosine brightness wave, instead of hard 1s blinking.
    const brightness = (1 + Math.cos(2 * Math.PI * time / REDUCED_MOTION_CYCLE_MS)) / 2;
    const chosenColor = thinkingIntensity > 0 ? 'warning' : messageColor;
    const raw = theme[chosenColor];
    const base = raw ? parseRGB(raw) : null;
    if (base) {
      const dimmed = interpolateColor(base, { r: 0, g: 0, b: 0 }, 0.5);
      const color = toRGBColor(interpolateColor(dimmed, base, Math.round(brightness * 8) / 8));
      return <Box aria-hidden flexWrap="wrap" height={1} width={2}>
        <Text color={color} bold={thinkingIntensity >= 0.5}>{REDUCED_MOTION_DOT}</Text>
      </Box>;
    }
    return <Box aria-hidden flexWrap="wrap" height={1} width={2}>
      <Text color={chosenColor} dimColor={brightness < 0.5} bold={thinkingIntensity >= 0.5}>{REDUCED_MOTION_DOT}</Text>
    </Box>;
  }
  const spinnerChar = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
  if (stalledIntensity > 0) {
    const baseColorStr = theme[messageColor];
    const baseRGB = baseColorStr ? parseRGB(baseColorStr) : null;
    if (baseRGB) {
      const interpolated = interpolateColor(baseRGB, ERROR_RED, stalledIntensity);
      return <Box flexWrap="wrap" height={1} width={2}><Text color={toRGBColor(interpolated)}>{spinnerChar}</Text></Box>;
    }
    const color = stalledIntensity > 0.5 ? "error" : messageColor;
    let t4;
    if ($[3] !== color || $[4] !== spinnerChar) {
      t4 = <Box flexWrap="wrap" height={1} width={2}><Text color={color}>{spinnerChar}</Text></Box>;
      $[3] = color;
      $[4] = spinnerChar;
      $[5] = t4;
    } else {
      t4 = $[5];
    }
    return t4;
  }
  if (thinkingIntensity > 0) {
    const base = theme[messageColor] ? parseRGB(theme[messageColor]) : null;
    const warning = theme.warning ? parseRGB(theme.warning) : null;
    const color = base && warning
      ? toRGBColor(interpolateColor(base, warning, Math.round(thinkingIntensity * 8) / 8))
      : thinkingIntensity > 0.5 ? 'warning' : messageColor;
    return <Box aria-hidden flexWrap="wrap" height={1} width={2}>
      <Text color={color} bold={thinkingIntensity >= 0.5}>{spinnerChar}</Text>
    </Box>;
  }
  let t4;
  if ($[6] !== messageColor || $[7] !== spinnerChar) {
    t4 = <Box flexWrap="wrap" height={1} width={2}><Text color={messageColor}>{spinnerChar}</Text></Box>;
    $[6] = messageColor;
    $[7] = spinnerChar;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  return t4;
}
