// biome-ignore lint/correctness/noUnusedImports: Bun 的 classic JSX 转换会引用 React。
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Box, Text } from "../../ink.js";
import { env } from "../../utils/env.js";
import { isScreenReaderEnabled } from "../../utils/accessibility/screenReaderRuntime.js";
import { getInitialSettings } from "../../utils/settings/settings.js";
import { Clawd, type ClawdPose } from "./Clawd.js";
import { clawdAnimations, clawdIdleSequence } from "./clawdAnimationData.ts";
import { getClickAnimationNames } from "./clawdAnimationSelection.js";

type AnimationName = keyof typeof clawdAnimations;
type Frame = {
	pose: ClawdPose;
	offset: number;
	x?: number;
	poof?: "dot" | "wave";
	shadow?: "wide" | "narrow";
};
const FRAME_MS = 60;
const IDLE: Frame = { pose: "default", offset: 0 };

/** The target release keeps the character in a fixed-width canvas while moving it. */
export function AnimatedClawd({
	sequence,
	autoplay = false,
	onComplete,
}: {
	sequence?: AnimationName;
	autoplay?: boolean;
	onComplete?: () => void;
} = {}) {
	const [reducedMotion] = useState(
		() => getInitialSettings().prefersReducedMotion ?? false,
	);
	const [frameIndex, setFrameIndex] = useState(() =>
		autoplay && !reducedMotion && !isScreenReaderEnabled() ? 0 : -1,
	);
	const sequenceRef = useRef<readonly Frame[]>(
		sequence
			? (clawdAnimations[sequence] as readonly Frame[])
			: (clawdIdleSequence as readonly Frame[]),
	);
	const onClick = () => {
		if (reducedMotion || isScreenReaderEnabled() || frameIndex !== -1) return;
		const names = getClickAnimationNames(env.terminal === "Apple_Terminal");
		const name = names[
			Math.floor(Math.random() * names.length)
		] as AnimationName;
		sequenceRef.current = clawdAnimations[name] as readonly Frame[];
		setFrameIndex(0);
	};
	useEffect(() => {
		if (frameIndex < 0) return;
		if (frameIndex >= sequenceRef.current.length) {
			setFrameIndex(-1);
			onComplete?.();
			return;
		}
		const timer = setTimeout(
			() => setFrameIndex((index) => index + 1),
			FRAME_MS,
		);
		return () => clearTimeout(timer);
	}, [frameIndex, onComplete]);
	const frame =
		frameIndex >= 0 && frameIndex < sequenceRef.current.length
			? (sequenceRef.current[frameIndex] ?? IDLE)
			: IDLE;
	const shadow =
		frame.shadow === "wide"
			? { glyphs: "▁▁▁", left: 3 }
			: frame.shadow === "narrow"
				? { glyphs: "▁", left: 4 }
				: undefined;
	return (
		<Box
			height={3}
			width={9}
			flexDirection="column"
			flexShrink={0}
			overflow="hidden"
			onClick={onClick}
		>
			<Box marginTop={frame.offset} marginLeft={frame.x ?? 0} flexShrink={0}>
				<Clawd pose={frame.pose} />
			</Box>
			{frame.poof && frame.offset > 0 && (
				<>
					<Box position="absolute" top={2} left={0}>
						<Text color="inactive">{frame.poof === "dot" ? "·" : "~"}</Text>
					</Box>
					<Box position="absolute" top={2} right={0}>
						<Text color="inactive">{frame.poof === "dot" ? "·" : "~"}</Text>
					</Box>
				</>
			)}
			{shadow && (
				<Box position="absolute" top={2} left={shadow.left}>
					<Text color="inactive">{shadow.glyphs}</Text>
				</Box>
			)}
		</Box>
	);
}
