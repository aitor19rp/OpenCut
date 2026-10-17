import type { SceneTracks } from "@/timeline";
import { getTrackTypeForElementType } from "@/timeline/placement/compatibility";
import { canPlaceTimeSpansOnTrack } from "@/timeline/placement/overlap";
import { planMainTrackInsertion } from "@/timeline/magnetic-main-track";
import type {
	GroupMoveResult,
	MoveGroup,
	PlannedElementMove,
	PlannedTrackCreation,
} from "./types";
import {
	getDisplayTracks,
	getTrackPlacementByDisplayIndex,
	getTrackPlacementById,
} from "./track-placement";
import {
	addMediaTime,
	maxMediaTime,
	type MediaTime,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

type GroupMoveTarget =
	| {
			kind: "existingTrack";
			anchorTargetTrackId: string;
	  }
	| {
			kind: "newTracks";
			anchorInsertIndex: number;
			newTrackIds: string[];
	  };

export function resolveGroupMove({
	group,
	tracks,
	anchorStartTime,
	target,
	insertOnMainTrack = false,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	target: GroupMoveTarget;
	/** Magnetic main track: dropping onto a clip inserts at the nearest cut. */
	insertOnMainTrack?: boolean;
}): GroupMoveResult | null {
	if (target.kind === "newTracks") {
		return resolveNewTrackMove({
			group,
			tracks,
			anchorStartTime,
			anchorInsertIndex: target.anchorInsertIndex,
			newTrackIds: target.newTrackIds,
		});
	}

	return resolveExistingTrackMove({
		group,
		tracks,
		anchorStartTime,
		anchorTargetTrackId: target.anchorTargetTrackId,
		insertOnMainTrack,
	});
}

function resolveExistingTrackMove({
	group,
	tracks,
	anchorStartTime,
	anchorTargetTrackId,
	insertOnMainTrack,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	anchorTargetTrackId: string;
	insertOnMainTrack: boolean;
}): GroupMoveResult | null {
	const anchorTargetPlacement = getTrackPlacementById({
		tracks,
		trackId: anchorTargetTrackId,
	});
	if (!anchorTargetPlacement) {
		return null;
	}

	const targetTrackIdsByElementId = resolveExistingTrackIdsByElementId({
		group,
		tracks,
		anchorTargetDisplayIndex: anchorTargetPlacement.displayIndex,
	});
	if (!targetTrackIdsByElementId) {
		return null;
	}

	const clampedAnchorStartTime = clampAnchorStartTime({
		group,
		tracks,
		anchorStartTime,
		targetTrackIdsByElementId,
	});

	const moves = group.members.map((member) => ({
		sourceTrackId: member.trackId,
		targetTrackId:
			targetTrackIdsByElementId.get(member.elementId) ?? member.trackId,
		elementId: member.elementId,
		newStartTime: addMediaTime({
			a: clampedAnchorStartTime,
			b: member.timeOffset,
		}),
	}));

	if (insertOnMainTrack && group.members.length === 1) {
		const insertion = planMoveIntoMainTrack({
			group,
			tracks,
			moves,
			anchorStartTime: clampedAnchorStartTime,
		});
		if (insertion) return insertion;
	}

	if (!canApplyMovesToExistingTracks({ tracks, moves })) {
		return null;
	}

	return {
		moves,
		createTracks: [],
		targetSelection: moves.map(({ elementId, targetTrackId }) => ({
			trackId: targetTrackId,
			elementId,
		})),
	};
}

/**
 * A single clip dropped on top of main-track clips goes in at the nearest cut
 * (or the start) and the clips after it make room. Null when it lands in free
 * space, so the regular move applies.
 */
function planMoveIntoMainTrack({
	group,
	tracks,
	moves,
	anchorStartTime,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	moves: PlannedElementMove[];
	anchorStartTime: MediaTime;
}): GroupMoveResult | null {
	const member = group.members[0];
	const move = moves[0];
	if (!member || !move || move.targetTrackId !== tracks.main.id) return null;
	if (member.elementType === "audio") return null;

	const stationaryTracks = {
		...tracks,
		main: {
			...tracks.main,
			elements: tracks.main.elements.filter(
				(element) => element.id !== member.elementId,
			),
		},
	} as SceneTracks;
	const insertion = planMainTrackInsertion({
		tracks: stationaryTracks,
		dropStartTime: anchorStartTime,
		duration: member.duration,
	});
	if (!insertion) return null;

	const shifts: PlannedElementMove[] = insertion.updates
		.filter((update) => update.trackId === tracks.main.id)
		.map((update) => ({
			sourceTrackId: update.trackId,
			targetTrackId: update.trackId,
			elementId: update.elementId,
			newStartTime: update.patch.startTime,
		}));
	const placed: PlannedElementMove = { ...move, newStartTime: insertion.startTime };
	return {
		moves: [...shifts, placed],
		createTracks: [],
		targetSelection: [{ trackId: placed.targetTrackId, elementId: placed.elementId }],
	};
}

function resolveNewTrackMove({
	group,
	tracks,
	anchorStartTime,
	anchorInsertIndex,
	newTrackIds,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	anchorInsertIndex: number;
	newTrackIds: string[];
}): GroupMoveResult | null {
	const sortedMembers = [...group.members].sort(
		(leftMember, rightMember) =>
			leftMember.displayIndex - rightMember.displayIndex,
	);
	const anchorMemberIndex = sortedMembers.findIndex(
		(member) => member.elementId === group.anchor.elementId,
	);
	if (anchorMemberIndex < 0 || newTrackIds.length < sortedMembers.length) {
		return null;
	}

	const hasAudioMember = sortedMembers.some(
		(member) => member.trackSection === "audio",
	);
	const hasNonAudioMember = sortedMembers.some(
		(member) => member.trackSection !== "audio",
	);
	if (hasAudioMember && hasNonAudioMember) {
		return null;
	}

	const clampedAnchorStartTime = clampAnchorStartTime({
		group,
		tracks,
		anchorStartTime,
		targetTrackIdsByElementId: new Map(),
	});
	const blockStartIndex = hasAudioMember
		? clampAudioInsertIndex({
				tracks,
				insertIndex: anchorInsertIndex - anchorMemberIndex,
			})
		: Math.max(
				0,
				Math.min(anchorInsertIndex - anchorMemberIndex, tracks.overlay.length),
			);

	const createTracks: PlannedTrackCreation[] = sortedMembers.map(
		(member, memberIndex) => ({
			id: newTrackIds[memberIndex],
			type: getTrackTypeForElementType({
				elementType: member.elementType,
			}),
			index: blockStartIndex + memberIndex,
		}),
	);
	const moves = sortedMembers.map((member, memberIndex) => ({
		sourceTrackId: member.trackId,
		targetTrackId: newTrackIds[memberIndex],
		elementId: member.elementId,
		newStartTime: addMediaTime({
			a: clampedAnchorStartTime,
			b: member.timeOffset,
		}),
	}));

	return {
		moves,
		createTracks,
		targetSelection: moves.map(({ elementId, targetTrackId }) => ({
			trackId: targetTrackId,
			elementId,
		})),
	};
}

function clampAudioInsertIndex({
	tracks,
	insertIndex,
}: {
	tracks: SceneTracks;
	insertIndex: number;
}): number {
	const minimumAudioInsertIndex = tracks.overlay.length + 1;
	return Math.max(
		minimumAudioInsertIndex,
		Math.min(insertIndex, minimumAudioInsertIndex + tracks.audio.length),
	);
}

function resolveExistingTrackIdsByElementId({
	group,
	tracks,
	anchorTargetDisplayIndex,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorTargetDisplayIndex: number;
}): Map<string, string> | null {
	const sortedMembers = [...group.members].sort(
		(leftMember, rightMember) =>
			leftMember.displayIndex - rightMember.displayIndex,
	);
	const anchorMemberIndex = sortedMembers.findIndex(
		(member) => member.elementId === group.anchor.elementId,
	);
	if (anchorMemberIndex < 0) {
		return null;
	}

	const targetTrackIdsByElementId = new Map<string, string>();
	const usedTrackIds = new Set<string>();
	const anchorPlacement = getTrackPlacementByDisplayIndex({
		tracks,
		displayIndex: anchorTargetDisplayIndex,
	});
	if (!anchorPlacement) {
		return null;
	}

	targetTrackIdsByElementId.set(
		group.anchor.elementId,
		anchorPlacement.trackId,
	);
	usedTrackIds.add(anchorPlacement.trackId);

	let upperBoundaryIndex = anchorTargetDisplayIndex;
	for (
		let memberIndex = anchorMemberIndex - 1;
		memberIndex >= 0;
		memberIndex -= 1
	) {
		const member = sortedMembers[memberIndex];
		const targetPlacement = findCompatibleTrackPlacement({
			tracks,
			requiredTrackType: getTrackTypeForElementType({
				elementType: member.elementType,
			}),
			startDisplayIndex: upperBoundaryIndex - 1,
			step: -1,
			usedTrackIds,
		});
		if (!targetPlacement) {
			return null;
		}

		targetTrackIdsByElementId.set(member.elementId, targetPlacement.trackId);
		usedTrackIds.add(targetPlacement.trackId);
		upperBoundaryIndex = targetPlacement.displayIndex;
	}

	let lowerBoundaryIndex = anchorTargetDisplayIndex;
	for (
		let memberIndex = anchorMemberIndex + 1;
		memberIndex < sortedMembers.length;
		memberIndex += 1
	) {
		const member = sortedMembers[memberIndex];
		const targetPlacement = findCompatibleTrackPlacement({
			tracks,
			requiredTrackType: getTrackTypeForElementType({
				elementType: member.elementType,
			}),
			startDisplayIndex: lowerBoundaryIndex + 1,
			step: 1,
			usedTrackIds,
		});
		if (!targetPlacement) {
			return null;
		}

		targetTrackIdsByElementId.set(member.elementId, targetPlacement.trackId);
		usedTrackIds.add(targetPlacement.trackId);
		lowerBoundaryIndex = targetPlacement.displayIndex;
	}

	return targetTrackIdsByElementId;
}

function findCompatibleTrackPlacement({
	tracks,
	requiredTrackType,
	startDisplayIndex,
	step,
	usedTrackIds,
}: {
	tracks: SceneTracks;
	requiredTrackType: ReturnType<typeof getTrackTypeForElementType>;
	startDisplayIndex: number;
	step: -1 | 1;
	usedTrackIds: Set<string>;
}) {
	for (
		let displayIndex = startDisplayIndex;
		displayIndex >= 0 &&
		displayIndex < tracks.overlay.length + 1 + tracks.audio.length;
		displayIndex += step
	) {
		const placement = getTrackPlacementByDisplayIndex({
			tracks,
			displayIndex,
		});
		if (!placement) {
			continue;
		}

		if (
			placement.trackType === requiredTrackType &&
			!usedTrackIds.has(placement.trackId)
		) {
			return placement;
		}
	}

	return null;
}

/**
 * While moving texts (and nothing on the main track), stops the group from
 * going past the end of the last main-track clip.
 */
function clampTextMembersToMainEnd({
	group,
	tracks,
	anchorStartTime,
	minimumAnchorStartTime,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	minimumAnchorStartTime: MediaTime;
}): MediaTime {
	const mainEnd = tracks.main.elements.reduce(
		(end, element) => Math.max(end, element.startTime + element.duration),
		0,
	);
	if (mainEnd <= 0) return anchorStartTime;

	let maximumAnchorStartTime = Number.POSITIVE_INFINITY;
	for (const member of group.members) {
		if (member.elementType !== "text") continue;
		maximumAnchorStartTime = Math.min(
			maximumAnchorStartTime,
			mainEnd - member.timeOffset - member.duration,
		);
	}
	if (!Number.isFinite(maximumAnchorStartTime)) return anchorStartTime;

	const limit = Math.max(minimumAnchorStartTime, maximumAnchorStartTime);
	return anchorStartTime > limit ? (limit as MediaTime) : anchorStartTime;
}

/**
 * Drag-preview version: keeps a group of texts (none on the main track)
 * from being dragged past the end of the last main-track clip.
 */
export function clampTextGroupAnchorTime({
	group,
	tracks,
	anchorStartTime,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
}): MediaTime {
	if (group.members.some((member) => member.trackSection === "main")) {
		return anchorStartTime;
	}
	return clampTextMembersToMainEnd({
		group,
		tracks,
		anchorStartTime,
		minimumAnchorStartTime: ZERO_MEDIA_TIME,
	});
}

function clampAnchorStartTime({
	group,
	tracks,
	anchorStartTime,
	targetTrackIdsByElementId,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	targetTrackIdsByElementId: Map<string, string>;
}): MediaTime {
	const minimumAnchorStartTime = group.members.reduce(
		(minimumStartTime, member) =>
			member.timeOffset < ZERO_MEDIA_TIME
				? maxMediaTime({
						a: minimumStartTime,
						b: subMediaTime({
							a: ZERO_MEDIA_TIME,
							b: member.timeOffset,
						}),
					})
				: minimumStartTime,
		ZERO_MEDIA_TIME,
	);
	let clampedAnchorStartTime =
		anchorStartTime < minimumAnchorStartTime
			? minimumAnchorStartTime
			: anchorStartTime;

	const memberOnMainTrack = group.members.find(
		(member) =>
			targetTrackIdsByElementId.get(member.elementId) === tracks.main.id,
	);
	if (!memberOnMainTrack) {
		return clampTextMembersToMainEnd({ group, tracks, anchorStartTime: clampedAnchorStartTime, minimumAnchorStartTime });
	}

	const movingElementIds = new Set(
		group.members.map((member) => member.elementId),
	);
	const requestedMainStartTime = addMediaTime({
		a: clampedAnchorStartTime,
		b: memberOnMainTrack.timeOffset,
	});
	const earliestStationaryMainStartTime = tracks.main.elements
		.filter((element) => !movingElementIds.has(element.id))
		.reduce<MediaTime | null>((earliestStartTime, element) => {
			if (earliestStartTime == null || element.startTime < earliestStartTime) {
				return element.startTime;
			}

			return earliestStartTime;
		}, null);
	if (
		earliestStationaryMainStartTime == null ||
		requestedMainStartTime <= earliestStationaryMainStartTime
	) {
		clampedAnchorStartTime = maxMediaTime({
			a: minimumAnchorStartTime,
			b: subMediaTime({
				a: ZERO_MEDIA_TIME,
				b: memberOnMainTrack.timeOffset,
			}),
		});
	}

	return clampedAnchorStartTime;
}

function canApplyMovesToExistingTracks({
	tracks,
	moves,
}: {
	tracks: SceneTracks;
	moves: PlannedElementMove[];
}): boolean {
	const movingElementIds = new Set(moves.map((move) => move.elementId));
	const sourceElements = new Map(
		getDisplayTracks({ tracks }).flatMap((track) =>
			track.elements.map((element) => [element.id, element] as const),
		),
	);
	const movesByTargetTrackId = new Map<string, PlannedElementMove[]>();
	for (const move of moves) {
		const targetMoves = movesByTargetTrackId.get(move.targetTrackId) ?? [];
		targetMoves.push(move);
		movesByTargetTrackId.set(move.targetTrackId, targetMoves);
	}

	for (const [targetTrackId, targetMoves] of movesByTargetTrackId) {
		const targetPlacement = getTrackPlacementById({
			tracks,
			trackId: targetTrackId,
		});
		if (!targetPlacement) {
			return false;
		}

		const targetTrack = getDisplayTracks({ tracks })[
			targetPlacement.displayIndex
		];
		if (!targetTrack) {
			return false;
		}

		const timeSpans = targetMoves.map((move) => {
			const sourceElement = sourceElements.get(move.elementId);
			return {
				startTime: move.newStartTime,
				duration: sourceElement?.duration ?? ZERO_MEDIA_TIME,
			};
		});
		if (hasOverlappingTimeSpans({ timeSpans })) {
			return false;
		}

		if (
			!canPlaceTimeSpansOnTrack({
				track: {
					elements: targetTrack.elements.filter(
						(element) => !movingElementIds.has(element.id),
					),
				},
				timeSpans,
			})
		) {
			return false;
		}
	}

	return true;
}

function hasOverlappingTimeSpans({
	timeSpans,
}: {
	timeSpans: Array<{ startTime: number; duration: number }>;
}): boolean {
	const sortedSpans = [...timeSpans].sort(
		(leftSpan, rightSpan) => leftSpan.startTime - rightSpan.startTime,
	);

	for (let spanIndex = 1; spanIndex < sortedSpans.length; spanIndex += 1) {
		const previousSpan = sortedSpans[spanIndex - 1];
		const currentSpan = sortedSpans[spanIndex];
		if (
			previousSpan.startTime + previousSpan.duration >
			currentSpan.startTime
		) {
			return true;
		}
	}

	return false;
}
