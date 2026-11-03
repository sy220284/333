import {
	clawdAnimations,
	clickAnimationNames,
	clawdAppearance,
} from "./clawdAnimationData.mjs";

export function getClickAnimationNames(appleTerminal: boolean): string[] {
	if (!appleTerminal) return [...clickAnimationNames];
	return clickAnimationNames.filter((name) => {
		const sequence = clawdAnimations[name as keyof typeof clawdAnimations];
		const first = sequence[0];
		if (
			!first ||
			sequence.some(
				(frame) => typeof frame.pose === "object" && "facing" in frame.pose,
			)
		)
			return false;
		const initialPose =
			typeof first.pose === "string"
				? clawdAppearance.poses[
						first.pose as keyof typeof clawdAppearance.poses
					]
				: first.pose;
		return (
			initialPose.eyes !== "open" || first.offset !== 0 || (first.x ?? 0) !== 0
		);
	});
}
