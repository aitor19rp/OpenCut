"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import type { TimelineElement, TimelineTrack } from "@/timeline";
import { type MediaTime, mediaTime, TICKS_PER_SECOND } from "@/wasm";
import { cn } from "@/utils/ui";

type FadePreset = "fade-in" | "fade-out" | "fade-in-out" | "dip-between" | "clear";

type FadePatch = { fadeIn?: MediaTime; fadeOut?: MediaTime };

const DURATIONS_SECONDS = [0.3, 0.5, 1, 2] as const;

const PRESETS: Array<{
	id: FadePreset;
	label: string;
	description: string;
	gradient: string;
}> = [
	{
		id: "fade-in",
		label: "Fundido de entrada",
		description: "Del negro a la imagen, al principio del clip",
		gradient: "linear-gradient(90deg, #000, #6b7280)",
	},
	{
		id: "fade-out",
		label: "Fundido de salida",
		description: "De la imagen al negro, al final del clip",
		gradient: "linear-gradient(90deg, #6b7280, #000)",
	},
	{
		id: "fade-in-out",
		label: "Entrada y salida",
		description: "Fundido a negro al principio y al final",
		gradient: "linear-gradient(90deg, #000, #6b7280 30%, #6b7280 70%, #000)",
	},
	{
		id: "dip-between",
		label: "A negro entre clips",
		description: "Corte con fundido a negro entre el clip anterior y este",
		gradient: "linear-gradient(90deg, #6b7280, #000 50%, #6b7280)",
	},
	{
		id: "clear",
		label: "Quitar fundidos",
		description: "Elimina los fundidos de los clips seleccionados",
		gradient: "linear-gradient(90deg, #6b7280, #6b7280)",
	},
];

const FADEABLE_TYPES = new Set(["video", "image", "text", "sticker", "graphic"]);

function findPreviousAdjacent({
	track,
	element,
}: {
	track: TimelineTrack;
	element: TimelineElement;
}): TimelineElement | null {
	const slack = TICKS_PER_SECOND / 10;
	let best: TimelineElement | null = null;
	for (const candidate of track.elements) {
		if (candidate.id === element.id) continue;
		const end = candidate.startTime + candidate.duration;
		if (Math.abs(end - element.startTime) <= slack) best = candidate;
	}
	return best;
}

interface FadeState {
	activePreset: FadePreset | null;
	/** Longest fade-in / fade-out among the selected clips, in seconds. */
	fadeInSeconds: number;
	fadeOutSeconds: number;
}

function getFadeState({
	tracks,
	selectedElements,
}: {
	tracks: TimelineTrack[];
	selectedElements: Array<{ trackId: string; elementId: string }>;
}): FadeState {
	let allHaveIn = true;
	let allHaveOut = true;
	let allDip = true;
	let count = 0;
	let fadeIn = 0;
	let fadeOut = 0;

	for (const ref of selectedElements) {
		const track = tracks.find((candidate) => candidate.id === ref.trackId);
		const element = track?.elements.find((el) => el.id === ref.elementId);
		if (!track || !element || !FADEABLE_TYPES.has(element.type)) continue;
		count += 1;
		const inLength = element.fadeIn ?? 0;
		const outLength = element.fadeOut ?? 0;
		fadeIn = Math.max(fadeIn, inLength);
		fadeOut = Math.max(fadeOut, outLength);
		if (inLength <= 0) allHaveIn = false;
		if (outLength <= 0) allHaveOut = false;
		const previous = findPreviousAdjacent({ track, element });
		if (inLength <= 0 || !previous || (previous.fadeOut ?? 0) <= 0) {
			allDip = false;
		}
	}

	let activePreset: FadePreset | null = null;
	if (count > 0) {
		if (allHaveIn && allHaveOut) activePreset = "fade-in-out";
		else if (allDip) activePreset = "dip-between";
		else if (allHaveIn) activePreset = "fade-in";
		else if (allHaveOut) activePreset = "fade-out";
	}
	return {
		activePreset,
		fadeInSeconds: fadeIn / TICKS_PER_SECOND,
		fadeOutSeconds: fadeOut / TICKS_PER_SECOND,
	};
}

function formatSeconds({ seconds }: { seconds: number }): string {
	return `${Number(seconds.toFixed(1))} s`;
}

export function TransitionsView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const sceneTracks = useEditor((e) => e.scenes.getActiveSceneOrNull()?.tracks);
	const [seconds, setSeconds] = useState<number>(0.5);
	const fadeState = sceneTracks
		? getFadeState({
				tracks: [
					...sceneTracks.overlay,
					sceneTracks.main,
					...sceneTracks.audio,
				],
				selectedElements,
			})
		: null;

	const apply = ({ preset }: { preset: FadePreset }) => {
		const scene = editor.scenes.getActiveScene();
		const tracks = [
			...scene.tracks.overlay,
			scene.tracks.main,
			...scene.tracks.audio,
		];
		const length = mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) });
		const zero = mediaTime({ ticks: 0 });

		const patches = new Map<string, { trackId: string; patch: FadePatch }>();
		const addPatch = ({
			trackId,
			elementId,
			patch,
		}: {
			trackId: string;
			elementId: string;
			patch: FadePatch;
		}) => {
			const existing = patches.get(elementId);
			patches.set(elementId, {
				trackId,
				patch: { ...(existing?.patch ?? {}), ...patch },
			});
		};

		for (const ref of selectedElements) {
			const track = tracks.find((candidate) => candidate.id === ref.trackId);
			const element = track?.elements.find((el) => el.id === ref.elementId);
			if (!track || !element || !FADEABLE_TYPES.has(element.type)) continue;

			if (preset === "fade-in") {
				addPatch({ ...ref, patch: { fadeIn: length } });
			} else if (preset === "fade-out") {
				addPatch({ ...ref, patch: { fadeOut: length } });
			} else if (preset === "fade-in-out") {
				addPatch({ ...ref, patch: { fadeIn: length, fadeOut: length } });
			} else if (preset === "clear") {
				addPatch({ ...ref, patch: { fadeIn: zero, fadeOut: zero } });
			} else {
				addPatch({ ...ref, patch: { fadeIn: length } });
				const previous = findPreviousAdjacent({ track, element });
				if (previous && FADEABLE_TYPES.has(previous.type)) {
					addPatch({
						trackId: track.id,
						elementId: previous.id,
						patch: { fadeOut: length },
					});
				}
			}
		}

		if (patches.size === 0) {
			toast.info("Selecciona un clip en la línea de tiempo", {
				description: "Los fundidos se aplican a los clips seleccionados.",
			});
			return;
		}

		editor.timeline.updateElements({
			updates: [...patches.entries()].map(([elementId, { trackId, patch }]) => ({
				trackId,
				elementId,
				patch: patch as Partial<TimelineElement>,
			})),
		});
	};

	return (
		<PanelView title="Transitions">
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">Duración</span>
					<div className="flex gap-1">
						{DURATIONS_SECONDS.map((option) => (
							<button
								key={option}
								type="button"
								className={cn(
									"flex-1 rounded border px-2 py-1 text-xs",
									seconds === option
										? "border-primary bg-primary/10 text-primary"
										: "hover:bg-accent",
								)}
								onClick={() => setSeconds(option)}
							>
								{option} s
							</button>
						))}
					</div>
				</div>
				<p className="text-muted-foreground text-xs">
					{selectedElements.length === 0
						? "Selecciona uno o varios clips y elige un fundido."
						: `Se aplica a ${selectedElements.length} clip(s) seleccionado(s).`}
				</p>
				{fadeState && selectedElements.length > 0 && (
					<p className="text-xs">
						<span className="text-muted-foreground">Actual: </span>
						{fadeState.fadeInSeconds > 0 || fadeState.fadeOutSeconds > 0
							? [
									fadeState.fadeInSeconds > 0
										? `entrada ${formatSeconds({ seconds: fadeState.fadeInSeconds })}`
										: null,
									fadeState.fadeOutSeconds > 0
										? `salida ${formatSeconds({ seconds: fadeState.fadeOutSeconds })}`
										: null,
								]
									.filter(Boolean)
									.join(" · ")
							: "sin fundidos"}
					</p>
				)}
				{PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						aria-pressed={fadeState?.activePreset === preset.id}
						className={cn(
							"hover:bg-accent flex items-center gap-3 rounded-md border p-2 text-left",
							fadeState?.activePreset === preset.id &&
								"border-primary bg-primary/10 ring-primary ring-1",
						)}
						onClick={() => apply({ preset: preset.id })}
					>
						<div
							className="h-10 w-16 shrink-0 rounded"
							style={{ background: preset.gradient }}
						/>
						<div className="min-w-0">
							<div className="flex items-center gap-1.5 text-sm font-medium">
								{preset.label}
								{fadeState?.activePreset === preset.id && (
									<span className="text-primary text-[10px] font-normal">
										● activo
									</span>
								)}
							</div>
							<div className="text-muted-foreground text-xs">
								{preset.description}
							</div>
						</div>
					</button>
				))}
			</div>
		</PanelView>
	);
}
