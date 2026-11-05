export function shouldUseCompactWelcome(
	rows: number,
	screenReader: boolean,
): boolean {
	return screenReader || rows < 30;
}
