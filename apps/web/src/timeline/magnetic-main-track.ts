import type { SceneTracks } from "@/timeline/types";
import { addMediaTime, ZERO_MEDIA_TIME } from "@/wasm";

/**
 * Packs the main track so its clips sit back to back from the start, keeping
 * their order. Returns null when the track is already packed.
 */
export function compactMainTrack({
	tracks,
}: {
	tracks: SceneTracks;
}): SceneTracks | null {
	const sortedElements = [...tracks.main.elements].sort(
		(a, b) => a.startTime - b.startTime,
	);

	let cursor = ZERO_MEDIA_TIME;
	let changed = false;
	const packedElements = sortedElements.map((element) => {
		const startTime = cursor;
		cursor = addMediaTime({ a: cursor, b: element.duration });
		if (element.startTime === startTime) return element;
		changed = true;
		return { ...element, startTime };
	});

	if (!changed) return null;

	return {
		...tracks,
		main: { ...tracks.main, elements: packedElements },
	} as SceneTracks;
}
