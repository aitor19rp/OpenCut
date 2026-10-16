/**
 * Multiplier (0..1) for a clip's opacity from its fade-in / fade-out lengths.
 * All values share one unit (ticks). The two fades never overlap: if they
 * would, each is scaled down proportionally to fit the clip.
 */
export function getFadeFactor({
	clipTime,
	duration,
	fadeIn,
	fadeOut,
}: {
	clipTime: number;
	duration: number;
	fadeIn?: number;
	fadeOut?: number;
}): number {
	let inLength = Math.max(0, fadeIn ?? 0);
	let outLength = Math.max(0, fadeOut ?? 0);
	if (inLength === 0 && outLength === 0) return 1;

	const total = inLength + outLength;
	if (total > duration && total > 0) {
		const scale = duration / total;
		inLength *= scale;
		outLength *= scale;
	}

	let factor = 1;
	if (inLength > 0 && clipTime < inLength) {
		factor = Math.min(factor, Math.max(0, clipTime / inLength));
	}
	if (outLength > 0 && clipTime > duration - outLength) {
		factor = Math.min(factor, Math.max(0, (duration - clipTime) / outLength));
	}
	return factor;
}
