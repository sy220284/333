import { c as _c } from "react/compiler-runtime";
import figures from 'figures';
import * as React from 'react';
import { useMemo, useRef } from 'react';
import { stringWidth } from '../../ink/stringWidth.js';
import { Box, Text, useAnimationFrame } from '../../ink.js';
import type { InProcessTeammateTaskState } from '../../tasks/InProcessTeammateTask/types.js';
import { formatDuration, formatNumber } from '../../utils/format.js';
import { toInkColor } from '../../utils/ink.js';
import type { Theme } from '../../utils/theme.js';
import { Byline } from '../design-system/Byline.js';
import { GlimmerMessage } from './GlimmerMessage.js';
import { SpinnerGlyph } from './SpinnerGlyph.js';
import type { SpinnerMode } from './types.js';
import { useStalledAnimation } from './useStalledAnimation.js';
import { getDefaultCharacters, interpolateColor, toRGBColor } from './utils.js';
import { advanceSpinnerStatusTracker, createSpinnerStatusTracker, deriveSpinnerStatus, describeSpinnerStatus, getSpinnerFrame, getProgressiveThinkingLabel, describeRetryStatus, advanceAnimatedTokenCount, SPINNER_METRICS_AFTER_MS, type OutputLimitRecovery, type SpinnerRetryStatus } from './statusLogic.js';
const SEP_WIDTH = stringWidth(' · ');
const THINKING_BARE_WIDTH = stringWidth('thinking');
const SHOW_TOKENS_AFTER_MS = SPINNER_METRICS_AFTER_MS;

// Thinking shimmer constants. Previously lived in a separate ThinkingShimmerText
// component with its own useAnimationFrame(50) — inlined here to reuse our
// existing 50ms clock and eliminate the redundant subscriber.
const THINKING_INACTIVE = {
  r: 153,
  g: 153,
  b: 153
};
const THINKING_INACTIVE_SHIMMER = {
  r: 185,
  g: 185,
  b: 185
};
const THINKING_DELAY_MS = 3000;
const THINKING_GLOW_PERIOD_S = 2;
export type SpinnerAnimationRowProps = {
  // Animation inputs
  mode: SpinnerMode;
  reducedMotion: boolean;
  hasActiveTools: boolean;
  responseLengthRef: React.RefObject<number>;

  // Message (stable within a turn)
  message: string;
  messageColor: keyof Theme;
  shimmerColor: keyof Theme;
  overrideColor?: keyof Theme | null;

  // Timer refs (stable references)
  loadingStartTimeRef: React.RefObject<number>;
  totalPausedMsRef: React.RefObject<number>;
  pauseStartTimeRef: React.RefObject<number | null>;

  // Display flags
  spinnerSuffix?: string | null;
  verbose: boolean;
  columns: number;

  // Teammate-derived (computed by parent from tasks)
  hasRunningTeammates: boolean;
  teammateTokens: number;
  foregroundedTeammate: InProcessTeammateTaskState | undefined;
  /** Leader's turn has completed. Suppresses stall-red since responseLengthRef/hasActiveTools track leader state only. */
  leaderIsIdle?: boolean;

  // Thinking (state owned by parent, mode-dependent)
  thinkingStatus: 'thinking' | number | null;
  effortSuffix: string;
  showToolCallTimer?: boolean;
  outputLimitRecovery?: OutputLimitRecovery | null;
  retryStatus?: SpinnerRetryStatus | null;
};

/**
 * The 50ms-animated portion of SpinnerWithVerb. Owns useAnimationFrame(50)
 * and all values derived from the animation clock (frame, glimmer, token
 * counter animation, elapsed-time, stalled intensity, thinking shimmer).
 *
 * The parent SpinnerWithVerb is freed from the 50ms render loop and only
 * re-renders when its props/app state change (~25x/turn instead of ~383x).
 * That keeps the outer Box shells, useAppState selectors, task filtering,
 * and tip/tree subtrees out of the hot animation path.
 */
export function SpinnerAnimationRow({
  mode,
  reducedMotion,
  hasActiveTools,
  responseLengthRef,
  message,
  messageColor,
  shimmerColor,
  overrideColor,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  spinnerSuffix,
  verbose,
  columns,
  hasRunningTeammates,
  teammateTokens,
  foregroundedTeammate,
  leaderIsIdle = false,
  thinkingStatus,
  effortSuffix,
  showToolCallTimer = false,
  outputLimitRecovery = null,
  retryStatus = null
}: SpinnerAnimationRowProps): React.ReactNode {
  const [viewportRef, time] = useAnimationFrame(reducedMotion ? null : mode === 'requesting' ? 50 : 100);

  // === Elapsed time (wall-clock, derived from refs each frame) ===
  const now = Date.now();
  const trackerRef = useRef(createSpinnerStatusTracker());
  const progressInput = { now, isThinking: mode === 'thinking', hasActiveTools, thinkingStatus, showToolCallTimer, outputLimitRecovery };
  trackerRef.current = advanceSpinnerStatusTracker(trackerRef.current, progressInput);
  const spinnerStatus = deriveSpinnerStatus(trackerRef.current, progressInput);
  const thinkingIntensity = spinnerStatus.kind === 'thinking'
    ? Math.min(Math.max((spinnerStatus.thinkingMs - 10000) / 10000, 0), 1) : 0;
  const elapsedTimeMs = pauseStartTimeRef.current !== null ? pauseStartTimeRef.current - loadingStartTimeRef.current - totalPausedMsRef.current : now - loadingStartTimeRef.current - totalPausedMsRef.current;

  // Track wall-clock turn start for teammates. While a swarm is running the
  // leader's elapsedTimeMs may jump around (new API calls reset
  // loadingStartTimeRef; pauses freeze it), so we anchor to the earliest
  // derived start seen so far. When no teammates are running this just tracks
  // derivedStart every frame, effectively resetting for the next swarm.
  const derivedStart = now - elapsedTimeMs;
  const turnStartRef = useRef(derivedStart);
  if (!hasRunningTeammates || derivedStart < turnStartRef.current) {
    turnStartRef.current = derivedStart;
  }

  // === Animation derivations from `time` ===
  const currentResponseLength = responseLengthRef.current;

  // Suppress stall detection when leader is idle — responseLengthRef and
  // hasActiveTools both track leader state. When viewing an active teammate
  // while leader is idle, they'd otherwise flag a false stall after 3s.
  // Treating leaderIsIdle like hasActiveTools resets the stall timer.
  const {
    isStalled,
    stalledIntensity
  } = useStalledAnimation(time, currentResponseLength,
    hasActiveTools || leaderIsIdle || mode === 'thinking' || pauseStartTimeRef.current !== null,
    reducedMotion);
  const frame = reducedMotion ? 0 : getSpinnerFrame(time, getDefaultCharacters().length);
  const glimmerSpeed = mode === 'requesting' ? 50 : 200;
  // message is stable within a turn; stringWidth is expensive enough (Bun native
  // call per code point) to memoize explicitly across the 50ms loop.
  const glimmerMessageWidth = useMemo(() => stringWidth(message), [message]);
  const cycleLength = glimmerMessageWidth + 20;
  const cyclePosition = Math.floor(time / glimmerSpeed);
  const glimmerIndex = reducedMotion ? -100 : isStalled ? -100 : mode === 'requesting' ? cyclePosition % cycleLength - 10 : glimmerMessageWidth + 10 - cyclePosition % cycleLength;
  const flashOpacity = reducedMotion ? 0 : mode === 'tool-use' ? (Math.sin(time / 1000 * Math.PI) + 1) / 2 : 0;

  // 2.1.310 samples the animated counter in 50ms logical steps even when
  // rendering at 100ms in non-requesting modes. It also decays on reset.
  const tokenCounterRef = useRef(currentResponseLength);
  const tokenCounterTickRef = useRef(time);
  if (reducedMotion || Math.abs(currentResponseLength - tokenCounterRef.current) > 2000) {
    tokenCounterRef.current = currentResponseLength;
    tokenCounterTickRef.current = time;
  } else {
    const ticks = Math.max(0, Math.floor((time - tokenCounterTickRef.current) / 50));
    if (ticks > 0) {
      tokenCounterRef.current = advanceAnimatedTokenCount(tokenCounterRef.current, currentResponseLength, ticks);
      tokenCounterTickRef.current += ticks * 50;
    }
  }
  const displayedResponseLength = tokenCounterRef.current;
  const leaderTokens = Math.round(displayedResponseLength / 4);
  const effectiveElapsedMs = hasRunningTeammates ? Math.max(elapsedTimeMs, now - turnStartRef.current) : elapsedTimeMs;
  const timerText = formatDuration(effectiveElapsedMs);
  const timerWidth = stringWidth(timerText);

  // === Token count (leader + teammates, or foregrounded teammate) ===
  const totalTokens = foregroundedTeammate && !foregroundedTeammate.isIdle ? foregroundedTeammate.progress?.tokenCount ?? 0 : leaderTokens + teammateTokens;
  const tokenCount = formatNumber(totalTokens);
  const tokensText = hasRunningTeammates ? `${tokenCount} tokens` : `${figures.arrowDown} ${tokenCount} tokens`;
  const tokensWidth = stringWidth(tokensText);

  // === Thinking text (may shrink to fit) ===
  let thinkingText = describeSpinnerStatus(spinnerStatus, effortSuffix, formatDuration);
  let thinkingWidthValue = thinkingText ? stringWidth(thinkingText) : 0;

  // === Progressive width gating ===
  const messageWidth = glimmerMessageWidth + 2;
  const sep = SEP_WIDTH;
  const wantsThinking = thinkingText !== null;
  const wantsTimerAndTokens = verbose || hasRunningTeammates || effectiveElapsedMs > SHOW_TOKENS_AFTER_MS || wantsThinking || totalTokens > 0 || Boolean(spinnerSuffix);
  const availableSpace = columns - messageWidth - 5;
  let showThinking = wantsThinking && availableSpace > thinkingWidthValue;
  if (!showThinking && spinnerStatus.kind === 'thinking' && (effortSuffix || getProgressiveThinkingLabel(spinnerStatus.thinkingMs) !== 'thinking')) {
    if (availableSpace > THINKING_BARE_WIDTH) {
      thinkingText = 'thinking';
      thinkingWidthValue = THINKING_BARE_WIDTH;
      showThinking = true;
    }
  }
  const usedAfterThinking = showThinking ? thinkingWidthValue + sep : 0;
  const showTimer = wantsTimerAndTokens && availableSpace > usedAfterThinking + timerWidth;
  const usedAfterTimer = usedAfterThinking + (showTimer ? timerWidth + sep : 0);
  const showTokens = wantsTimerAndTokens && totalTokens > 0 && availableSpace > usedAfterTimer + tokensWidth;
  const thinkingOnly = showThinking && spinnerStatus.kind === 'thinking' && !spinnerSuffix && !showTimer && !showTokens;

  // === Thinking shimmer color (formerly ThinkingShimmerText's own timer) ===
  // Same sine-wave opacity, but derived from our shared `time` instead of a
  // second useAnimationFrame(50) subscription.
  const thinkingElapsedSec = (time - THINKING_DELAY_MS) / 1000;
  const thinkingOpacity = time < THINKING_DELAY_MS ? 0 : (Math.sin(thinkingElapsedSec * Math.PI * 2 / THINKING_GLOW_PERIOD_S) + 1) / 2;
  const thinkingShimmerColor = toRGBColor(interpolateColor(THINKING_INACTIVE, THINKING_INACTIVE_SHIMMER, thinkingOpacity));

  // === Build status parts ===
  const parts = [...(spinnerSuffix ? [<Text dimColor key="suffix">
            {spinnerSuffix}
          </Text>] : []), ...(showTimer ? [<Text dimColor key="elapsedTime">
            {timerText}
          </Text>] : []), ...(showTokens ? [<Box flexDirection="row" key="tokens">
            {!hasRunningTeammates && <SpinnerModeGlyph mode={mode} />}
            <Text dimColor>{tokenCount} tokens</Text>
          </Box>] : []), ...(showThinking && thinkingText ? [spinnerStatus.kind === 'thinking' && !reducedMotion ? <Text key="thinking" color={thinkingShimmerColor}>
              {thinkingOnly ? `(${thinkingText})` : thinkingText}
            </Text> : <Text dimColor key="thinking">
              {thinkingText}
            </Text>] : [])];
  const status = foregroundedTeammate && !foregroundedTeammate.isIdle ? <>
        <Text dimColor>(esc to interrupt </Text>
        <Text color={toInkColor(foregroundedTeammate.identity.color)}>
          {foregroundedTeammate.identity.agentName}
        </Text>
        <Text dimColor>)</Text>
      </> : !foregroundedTeammate && parts.length > 0 ? thinkingOnly ? <Byline>{parts}</Byline> : <>
          <Text dimColor>(</Text>
          <Byline>{parts}</Byline>
          <Text dimColor>)</Text>
        </> : null;
  if (retryStatus !== null) {
    const retryText = describeRetryStatus(retryStatus, now, formatDuration);
    return <Box ref={viewportRef} flexDirection="row" flexWrap="wrap" marginTop={1} width="100%">
      <Text color="error">✻ </Text>
      <Text color="error">{retryText}</Text>
    </Box>;
  }
  return <Box ref={viewportRef} flexDirection="row" flexWrap="wrap" marginTop={1} width="100%">
      <SpinnerGlyph frame={frame} messageColor={messageColor} stalledIntensity={overrideColor ? 0 : stalledIntensity} thinkingIntensity={overrideColor ? 0 : thinkingIntensity} reducedMotion={reducedMotion} time={time} />
      <GlimmerMessage message={message} mode={mode} messageColor={messageColor} glimmerIndex={glimmerIndex} flashOpacity={flashOpacity} shimmerColor={shimmerColor} stalledIntensity={overrideColor ? 0 : stalledIntensity} />
      {status}
    </Box>;
}
function SpinnerModeGlyph(t0) {
  const $ = _c(2);
  const {
    mode
  } = t0;
  switch (mode) {
    case "tool-input":
    case "tool-use":
    case "responding":
    case "thinking":
      {
        let t1;
        if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <Box width={2}><Text dimColor={true}>{figures.arrowDown}</Text></Box>;
          $[0] = t1;
        } else {
          t1 = $[0];
        }
        return t1;
      }
    case "requesting":
      {
        let t1;
        if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <Box width={2}><Text dimColor={true}>{figures.arrowUp}</Text></Box>;
          $[1] = t1;
        } else {
          t1 = $[1];
        }
        return t1;
      }
  }
}
