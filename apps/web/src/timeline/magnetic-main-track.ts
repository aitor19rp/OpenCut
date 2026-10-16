import type { SceneTracks, TimelineElement } from "@/timeline/types";
import {
	addMediaTime,
	type MediaTime,
	mediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

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

	return applyFollowingTexts({
		tracks: {
			...tracks,
			main: { ...tracks.main, elements: packedElements },
		} as SceneTracks,
		mainBefore: tracks.main.elements,
	});
}

interface ClipSpan {
	id: string;
	start: number;
	end: number;
}

function toSpans(elements: readonly TimelineElement[]): ClipSpan[] {
	return [...elements]
		.map((element) => ({
			id: element.id,
			start: element.startTime,
			end: element.startTime + element.duration,
		}))
		.sort((a, b) => a.start - b.start);
}

/**
 * Maps a time on the old main track to the new one: clip boundaries map to
 * the same boundary, times inside a clip move with that clip, and times in
 * a gap or past the end move with the clip before them.
 */
function remapTime({
	time,
	before,
	afterById,
}: {
	time: number;
	before: ClipSpan[];
	afterById: Map<string, ClipSpan>;
}): number {
	for (const clip of before) {
		const moved = afterById.get(clip.id);
		if (!moved) continue;
		if (time === clip.start) return moved.start;
		if (time === clip.end) return moved.end;
		if (time > clip.start && time < clip.end) {
			return Math.min(moved.end, moved.start + (time - clip.start));
		}
	}
	let previous: ClipSpan | null = null;
	for (const clip of before) {
		if (clip.end <= time && afterById.has(clip.id)) previous = clip;
	}
	if (!previous) return time;
	const moved = afterById.get(previous.id) as ClipSpan;
	return time + (moved.end - previous.end);
}

/**
 * Text clips on overlay tracks follow the main-track clips they're aligned
 * with when those clips are moved or resized.
 */
export function getFollowingTextUpdates({
	tracks,
	mainBefore,
	mainAfter,
}: {
	tracks: SceneTracks;
	mainBefore: readonly TimelineElement[];
	mainAfter: readonly TimelineElement[];
}): Array<{ trackId: string; element: TimelineElement; startTime: MediaTime; duration: MediaTime }> {
	const before = toSpans(mainBefore);
	const afterSpans = toSpans(mainAfter);
	const afterById = new Map(afterSpans.map((span) => [span.id, span]));
	const mainEnd = afterSpans.reduce((end, span) => Math.max(end, span.end), 0);
	const updates: Array<{
		trackId: string;
		element: TimelineElement;
		startTime: MediaTime;
		duration: MediaTime;
	}> = [];

	for (const track of tracks.overlay) {
		for (const element of track.elements) {
			if (element.type !== "text") continue;
			const start = remapTime({ time: element.startTime, before, afterById });
			const remappedEnd = remapTime({
				time: element.startTime + element.duration,
				before,
				afterById,
			});
			// Never let a text run past the end of the last clip.
			const end = afterSpans.length > 0 ? Math.min(remappedEnd, mainEnd) : remappedEnd;
			if (end <= start) continue;
			if (start === element.startTime && end - start === element.duration) {
				continue;
			}
			updates.push({
				trackId: track.id,
				element,
				startTime: mediaTime({ ticks: Math.round(start) }),
				duration: mediaTime({ ticks: Math.round(end - start) }),
			});
		}
	}
	return updates;
}

/** Applies getFollowingTextUpdates to a SceneTracks value. */
export function applyFollowingTexts({
	tracks,
	mainBefore,
}: {
	tracks: SceneTracks;
	mainBefore: readonly TimelineElement[];
}): SceneTracks {
	const updates = getFollowingTextUpdates({
		tracks,
		mainBefore,
		mainAfter: tracks.main.elements,
	});
	if (updates.length === 0) return tracks;
	const byId = new Map(updates.map((update) => [update.element.id, update]));
	return {
		...tracks,
		overlay: tracks.overlay.map((track) => ({
			...track,
			elements: track.elements.map((element) => {
				const update = byId.get(element.id);
				return update
					? { ...element, startTime: update.startTime, duration: update.duration }
					: element;
			}),
		})),
	} as SceneTracks;
}
