import type { MouseEvent as ReactMouseEvent } from "react";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import {
	addMediaTime,
	maxMediaTime,
	type MediaTime,
	mediaTime,
	minMediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
} from "@/wasm";
import {
	computeGroupResize,
	type GroupResizeMember,
	type GroupResizeResult,
	type GroupResizeUpdate,
	type ResizeSide,
} from "@/timeline/group-resize";
import {
	buildTimelineSnapPoints,
	getTimelineSnapThresholdInTicks,
	resolveTimelineSnap,
	type SnapPoint,
} from "@/timeline/snapping";
import { getElementEdgeSnapPoints } from "@/timeline/element-snap-source";
import { getPlayheadSnapPoints } from "@/timeline/playhead-snap-source";
import { getAnimationKeyframeSnapPointsForTimeline } from "@/timeline/animation-snap-points";
import {
	isRetimableElement,
	type SceneTracks,
	type TimelineElement,
	type TimelineTrack,
} from "@/timeline";
import type { ElementRef } from "@/timeline/types";
import type { FrameRate } from "opencut-wasm";

// --- Session ---

interface ResizeSession {
	kind: "active";
	side: ResizeSide;
	startX: number;
	fps: FrameRate;
	members: GroupResizeMember[];
	result: GroupResizeResult | null;
}

type Session = { kind: "idle" } | ResizeSession;

// --- Config ---

export interface ResizeConfig {
	zoomLevel: number;
	snappingEnabled: boolean;
	isShiftHeld: () => boolean;
	getSceneTracks: () => SceneTracks;
	getCurrentPlayheadTime: () => MediaTime;
	getActiveProjectFps: () => FrameRate | null;
	selectedElements: ElementRef[];
	discardPreview: () => void;
	previewElements: (updates: GroupResizeUpdate[]) => void;
	commitElements: (updates: GroupResizeUpdate[]) => void;
	onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	/** Shows the frame at the edge being trimmed in the preview while dragging. */
	previewFrameAt?: (params: { time: MediaTime }) => void;
	/** Called once the drag ends, to restore whatever previewFrameAt changed. */
	endFramePreview?: () => void;
	onResizingElementsChange?: (elementIds: string[]) => void;
	/** When true, main-track clips stay packed: edges push neighbours instead of stopping at them. */
	isMagneticMainTrack?: () => boolean;
}

export interface ResizeConfigRef {
	readonly current: ResizeConfig;
}

// --- Pure helpers ---

/**
 * Left bound used on a magnetic track: far enough that only the clip's own
 * trimmed source limits how far its start can be extended.
 */
const UNBOUNDED_LEFT = mediaTime({ ticks: -(2 ** 50) });

export function buildResizeMembers({
	tracks,
	selectedElements,
	unboundedTrackId,
}: {
	tracks: SceneTracks;
	selectedElements: ElementRef[];
	/** Track whose neighbours don't limit resizing (the magnetic main track). */
	unboundedTrackId?: string;
}): GroupResizeMember[] {
	const selectedElementIds = new Set(
		selectedElements.map((el) => el.elementId),
	);
	const trackMap = new Map(
		[...tracks.overlay, tracks.main, ...tracks.audio].map((track) => [
			track.id,
			track,
		]),
	);

	return selectedElements.flatMap(({ trackId, elementId }) => {
		const track = trackMap.get(trackId);
		const element = track?.elements.find((el) => el.id === elementId);
		if (!track || !element) return [];

		const otherElements = track.elements.filter(
			(el) => !selectedElementIds.has(el.id),
		);
		const leftNeighborBound = otherElements
			.filter(
				(el) =>
					addMediaTime({ a: el.startTime, b: el.duration }) <=
					element.startTime,
			)
			.reduce<MediaTime | null>((bound, el) => {
				const elementEnd = addMediaTime({
					a: el.startTime,
					b: el.duration,
				});
				return bound === null
					? elementEnd
					: maxMediaTime({ a: bound, b: elementEnd });
			}, null);
		const rightNeighborBound = otherElements
			.filter(
				(el) =>
					el.startTime >= addMediaTime({ a: element.startTime, b: element.duration }),
			)
			.reduce<MediaTime | null>(
				(bound, el) =>
					bound === null
						? el.startTime
						: minMediaTime({ a: bound, b: el.startTime }),
				null,
			);

		return [
			{
				trackId,
				elementId,
				startTime: element.startTime,
				duration: element.duration,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
				sourceDuration: element.sourceDuration,
				retime: isRetimableElement(element) ? element.retime : undefined,
				leftNeighborBound:
					trackId === unboundedTrackId ? UNBOUNDED_LEFT : leftNeighborBound,
				rightNeighborBound:
					trackId === unboundedTrackId ? null : rightNeighborBound,
			},
		];
	});
}

function getTrimmedEdgeTime({
	result,
	elementId,
	side,
	fps,
}: {
	result: GroupResizeResult;
	elementId: string;
	side: ResizeSide;
	fps: FrameRate;
}): MediaTime | null {
	const update = result.updates.find(
		(candidate) => candidate.elementId === elementId,
	);
	if (!update) return null;
	const { startTime, duration } = update.patch;
	if (side === "left") return startTime;
	// The end time itself is the first frame after the clip, so step back one.
	const ticksPerFrame = Math.round(
		(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
	);
	const frameDuration = mediaTime({ ticks: ticksPerFrame });
	if (duration <= frameDuration) return startTime;
	return addMediaTime({
		a: startTime,
		b: subMediaTime({ a: duration, b: frameDuration }),
	});
}

/**
 * Re-lays the main track back to back in its original order, applying the
 * resized clips' new trims and durations, so neighbours move out of the way.
 */
function packMainTrackUpdates({
	mainTrack,
	updates,
}: {
	mainTrack: TimelineTrack;
	updates: GroupResizeUpdate[];
}): GroupResizeUpdate[] {
	const updatesById = new Map(
		updates
			.filter((update) => update.trackId === mainTrack.id)
			.map((update) => [update.elementId, update]),
	);
	const otherUpdates = updates.filter(
		(update) => update.trackId !== mainTrack.id,
	);
	const sortedElements = [...mainTrack.elements].sort(
		(a, b) => a.startTime - b.startTime,
	);

	let cursor = mediaTime({ ticks: 0 });
	const packed: GroupResizeUpdate[] = [];
	for (const element of sortedElements) {
		const update = updatesById.get(element.id);
		const duration = update?.patch.duration ?? element.duration;
		if (update || element.startTime !== cursor) {
			packed.push({
				trackId: mainTrack.id,
				elementId: element.id,
				patch: {
					trimStart: update?.patch.trimStart ?? element.trimStart,
					trimEnd: update?.patch.trimEnd ?? element.trimEnd,
					startTime: cursor,
					duration,
				},
			});
		}
		cursor = addMediaTime({ a: cursor, b: duration });
	}
	return [...otherUpdates, ...packed];
}

function hasResizeChanges({
	members,
	result,
}: {
	members: GroupResizeMember[];
	result: GroupResizeResult;
}): boolean {
	return result.updates.some((update) => {
		const member = members.find((m) => m.elementId === update.elementId);
		return (
			member?.trimStart !== update.patch.trimStart ||
			member?.trimEnd !== update.patch.trimEnd ||
			member?.startTime !== update.patch.startTime ||
			member?.duration !== update.patch.duration
		);
	});
}

// --- Controller ---

export class ResizeController {
	private session: Session = { kind: "idle" };
	private readonly subscribers = new Set<() => void>();
	private readonly configRef: ResizeConfigRef;

	constructor(deps: { configRef: ResizeConfigRef }) {
		this.configRef = deps.configRef;
		this.onResizeStart = this.onResizeStart.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);
	}

	private get config(): ResizeConfig {
		return this.configRef.current;
	}

	get isResizing(): boolean {
		return this.session.kind === "active";
	}

	subscribe(fn: () => void): () => void {
		this.subscribers.add(fn);
		return () => this.subscribers.delete(fn);
	}

	cancel(): void {
		this.config.discardPreview();
		this.finishSession();
	}

	destroy(): void {
		this.deactivate();
		this.subscribers.clear();
	}

	onResizeStart({
		event,
		element,
		track,
		side,
	}: {
		event: ReactMouseEvent;
		element: TimelineElement;
		track: TimelineTrack;
		side: ResizeSide;
	}): void {
		event.stopPropagation();
		event.preventDefault();

		// UI should prevent this, but be explicit: a new resize start
		// means the previous one is abandoned, not silently replaced.
		if (this.session.kind === "active") this.cancel();

		const fps = this.config.getActiveProjectFps();
		if (!fps) return;

		const ref = { trackId: track.id, elementId: element.id };
		const activeSelection = this.config.selectedElements.some(
			(el) => el.trackId === track.id && el.elementId === element.id,
		)
			? this.config.selectedElements
			: [ref];

		const sceneTracks = this.config.getSceneTracks();
		const members = buildResizeMembers({
			tracks: sceneTracks,
			selectedElements: activeSelection,
			unboundedTrackId: this.config.isMagneticMainTrack?.()
				? sceneTracks.main.id
				: undefined,
		});
		if (members.length === 0) return;

		this.config.discardPreview();

		this.session = {
			kind: "active",
			side,
			startX: event.clientX,
			fps,
			members,
			result: null,
		};
		this.config.onResizingElementsChange?.(
			members.map((member) => member.elementId),
		);
		this.activate();
		this.notify();
	}

	private activate(): void {
		document.addEventListener("mousemove", this.handleMouseMove);
		document.addEventListener("mouseup", this.handleMouseUp);
	}

	private deactivate(): void {
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);
	}

	private notify(): void {
		for (const fn of this.subscribers) fn();
	}

	private finishSession(): void {
		const wasActive = this.session.kind === "active";
		this.session = { kind: "idle" };
		this.deactivate();
		this.config.onSnapPointChange?.(null);
		if (wasActive) {
			this.config.endFramePreview?.();
			this.config.onResizingElementsChange?.([]);
		}
		this.notify();
	}

	private snappedDelta(
		session: ResizeSession,
		rawDeltaTime: MediaTime,
	): MediaTime {
		const { snappingEnabled, isShiftHeld, zoomLevel } = this.config;

		if (!snappingEnabled || isShiftHeld()) {
			this.config.onSnapPointChange?.(null);
			return rawDeltaTime;
		}

		const tracks = this.config.getSceneTracks();
		const playheadTime = this.config.getCurrentPlayheadTime();
		const excludeElementIds = new Set(session.members.map((m) => m.elementId));

		const snapPoints = buildTimelineSnapPoints({
			sources: [
				() => getElementEdgeSnapPoints({ tracks, excludeElementIds }),
				() => getPlayheadSnapPoints({ playheadTime }),
				() =>
					getAnimationKeyframeSnapPointsForTimeline({
						tracks,
						excludeElementIds,
					}),
			],
		});
		const maxSnapDistance = getTimelineSnapThresholdInTicks({ zoomLevel });

		let closestSnapPoint: SnapPoint | null = null;
		let closestSnapDistance = Infinity;
		let deltaTime = rawDeltaTime;

		for (const member of session.members) {
			const baseEdgeTime =
				session.side === "left"
					? member.startTime
					: addMediaTime({ a: member.startTime, b: member.duration });
			const snapResult = resolveTimelineSnap({
				targetTime: addMediaTime({ a: baseEdgeTime, b: rawDeltaTime }),
				snapPoints,
				maxSnapDistance,
			});
			if (
				snapResult.snapPoint &&
				snapResult.snapDistance < closestSnapDistance
			) {
				closestSnapDistance = snapResult.snapDistance;
				closestSnapPoint = snapResult.snapPoint;
				deltaTime = subMediaTime({ a: snapResult.snappedTime, b: baseEdgeTime });
			}
		}

		this.config.onSnapPointChange?.(closestSnapPoint);
		return deltaTime;
	}

	private handleMouseMove({ clientX }: MouseEvent): void {
		if (this.session.kind !== "active") return;
		const session = this.session;

		const rawDeltaTime = mediaTime({
			ticks: Math.round(
				((clientX - session.startX) /
					(BASE_TIMELINE_PIXELS_PER_SECOND * this.config.zoomLevel)) *
					TICKS_PER_SECOND,
			),
		});
		const deltaTime = this.snappedDelta(session, rawDeltaTime);
		const computed = computeGroupResize({
			members: session.members,
			side: session.side,
			deltaTime,
			fps: session.fps,
		});
		const result = this.config.isMagneticMainTrack?.()
			? {
					...computed,
					updates: packMainTrackUpdates({
						mainTrack: this.config.getSceneTracks().main,
						updates: computed.updates,
					}),
				}
			: computed;

		session.result = result;
		this.config.previewElements(result.updates);

		const edgeTime = getTrimmedEdgeTime({
			result,
			elementId: session.members[0].elementId,
			side: session.side,
			fps: session.fps,
		});
		if (edgeTime !== null) {
			this.config.previewFrameAt?.({ time: edgeTime });
		}
	}

	private handleMouseUp(): void {
		if (this.session.kind !== "active") return;
		const session = this.session;

		this.config.discardPreview();

		if (
			session.result &&
			hasResizeChanges({ members: session.members, result: session.result })
		) {
			this.config.commitElements(session.result.updates);
		}

		this.finishSession();
	}
}
