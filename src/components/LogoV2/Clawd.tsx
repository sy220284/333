// biome-ignore lint/correctness/noUnusedImports: Bun 的 classic JSX 转换会引用 React。
import * as React from "react";
import { Box, Text } from "../../ink.js";
import { env } from "../../utils/env.js";
import { isScreenReaderEnabled } from "../../utils/accessibility/screenReaderRuntime.js";
import { clawdAppearance } from "./clawdAnimationData.ts";

type NamedPose = keyof typeof clawdAppearance.poses;
type Eyes = keyof typeof clawdAppearance.eyes;
type Arms = keyof typeof clawdAppearance.arms;
type Feet = keyof typeof clawdAppearance.feet;
type Facing = keyof typeof clawdAppearance.facing;
export type ClawdPose =
	| NamedPose
	| { eyes: Eyes; arms: Arms; feet: Feet }
	| { facing: Facing };

type Props = { pose?: ClawdPose; color?: string };

function FacingClawd({ facing, color }: { facing: Facing; color: string }) {
	return (
		<Box flexDirection="column" flexShrink={0}>
			{clawdAppearance.facing[facing].map(({ glyphs, from, to }, index) => (
				<Text key={index} color={color}>
					{glyphs.slice(0, from)}
					<Text backgroundColor="clawd_background">
						{glyphs.slice(from, to)}
					</Text>
					{glyphs.slice(to)}
				</Text>
			))}
		</Box>
	);
}

function AppleTerminalClawd({ eyes, color }: { eyes: Eyes; color: string }) {
	return (
		<Box flexDirection="column" alignItems="center">
			<Text>
				<Text color={color}>▗</Text>
				<Text color="clawd_background" backgroundColor={color}>
					{clawdAppearance.appleEyes[eyes]}
				</Text>
				<Text color={color}>▖</Text>
			</Text>
			<Text backgroundColor={color}>{" ".repeat(7)}</Text>
			<Text color={color}>▘▘ ▝▝</Text>
		</Box>
	);
}

export function Clawd({ pose = "default", color = "clawd_body" }: Props) : React.JSX.Element {
	if (isScreenReaderEnabled()) return null;
	if (typeof pose !== "string" && "facing" in pose) {
		return env.terminal === "Apple_Terminal" ? (
			<AppleTerminalClawd eyes="open" color={color} />
		) : (
			<FacingClawd facing={pose.facing} color={color} />
		);
	}
	const shape = typeof pose === "string" ? clawdAppearance.poses[pose] : pose;
	if (env.terminal === "Apple_Terminal")
		return <AppleTerminalClawd eyes={shape.eyes as Eyes} color={color} />;
	const arms = clawdAppearance.arms[shape.arms as Arms];
	let column = 2;
	return (
		<Box flexDirection="column" flexShrink={0}>
			<Text>
				<Text color={color}>{arms.r1L}</Text>
				{clawdAppearance.eyes[shape.eyes as Eyes].map((span, index) => {
					const start = column;
					column += span.glyphs.length;
					return (
						<Text
							key={start + index}
							color={"lid" in span && span.lid ? "clawd_background" : color}
							backgroundColor={
								"lid" in span && span.lid ? color : "clawd_background"
							}
						>
							{span.glyphs}
						</Text>
					);
				})}
				<Text color={color}>{arms.r1R}</Text>
			</Text>
			<Text>
				<Text color={color}>{arms.r2L}</Text>
				<Text color={color} backgroundColor="clawd_background">
					█████
				</Text>
				<Text color={color}>{arms.r2R}</Text>
			</Text>
			<Text color={color}>{clawdAppearance.feet[shape.feet as Feet]}</Text>
		</Box>
	);
}
