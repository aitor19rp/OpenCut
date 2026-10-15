"use client";

import { useState, useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import { formatTimecode } from "opencut-wasm";
import { invokeAction } from "@/actions";
import { EditableTimecode } from "@/components/editable-timecode";
import { Button } from "@/components/ui/button";
import {
	FullScreenIcon,
	PauseIcon,
	PictureInPictureExitIcon,
	PictureInPictureOnIcon,
	SquareIcon,
	PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectTrigger,
	SelectContent,
	SelectItem,
	SelectSeparator,
} from "@/components/ui/select";
import { PREVIEW_ZOOM_PRESETS } from "@/preview/zoom";
import { usePreviewViewport } from "./preview-viewport";
import { GridPopover } from "./guide-popover";
import { usePreviewStore } from "@/preview/preview-store";
import {
	SAFE_ZONE_TEMPLATE_IDS,
	SAFE_ZONE_TEMPLATES,
	type SafeZoneTemplateId,
} from "@/preview/safe-zone-overlay";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isPreviewOverlayVisible } from "@/preview/overlays";
import type { MediaTime } from "@/wasm";

export function PreviewToolbar({
	onToggleFullscreen,
	onTogglePopout,
	isPoppedOut,
}: {
	onToggleFullscreen: () => void;
	onTogglePopout: () => void;
	isPoppedOut: boolean;
}) {
	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center pb-3 pt-5 px-5">
			<TimecodeDisplay />
			<PlayPauseButton />
			<div className="justify-self-end flex items-center gap-2.5">
				<ZoomSelect />
				<Separator orientation="vertical" className="h-4" />
				{/* v0.4.0 */}
				{/* <GridPopover>
					<Button
						variant={activeGuideDefinition ? "secondary" : "text"}
						size="icon"
					>
						{activeGuideDefinition ? (
							activeGuideDefinition.renderTriggerIcon()
						) : (
							<HugeiconsIcon icon={GridTableIcon} />
						)}
					</Button>
				</GridPopover> */}
				<SafeZoneButton />
				<Button
					variant="text"
					onClick={onTogglePopout}
					title={isPoppedOut ? "Close pop-out player" : "Pop out player"}
				>
					<HugeiconsIcon
						icon={
							isPoppedOut ? PictureInPictureExitIcon : PictureInPictureOnIcon
						}
					/>
				</Button>
				<Button variant="text" onClick={onToggleFullscreen}>
					<HugeiconsIcon icon={FullScreenIcon} />
				</Button>
			</div>
		</div>
	);
}

export function TimecodeDisplay() {
	const editor = useEditor();
	const totalDuration = useEditor((e) => e.timeline.getTotalDuration());
	const fps = useEditor((e) => e.project.getActive().settings.fps);
	const [currentTime, setCurrentTime] = useState<MediaTime>(() =>
		editor.playback.getCurrentTime(),
	);

	useEffect(() => {
		const unsubscribeUpdate = editor.playback.onUpdate(setCurrentTime);
		const unsubscribeSeek = editor.playback.onSeek(setCurrentTime);
		return () => {
			unsubscribeUpdate();
			unsubscribeSeek();
		};
	}, [editor.playback]);

	return (
		<div className="flex items-center">
			<EditableTimecode
				time={currentTime}
				duration={totalDuration}
				format="HH:MM:SS:FF"
				fps={fps}
				onTimeChange={({ time }) => editor.playback.seek({ time })}
				className="text-center"
			/>
			<span className="text-muted-foreground px-2 font-mono text-xs">/</span>
			<span className="text-muted-foreground font-mono text-xs">
				{formatTimecode({
					time: totalDuration,
					format: "HH:MM:SS:FF",
					rate: fps,
				})}
			</span>
		</div>
	);
}

function ZoomSelect() {
	const { isAtFit, zoomPercent, fitToScreen, setViewportPercent } =
		usePreviewViewport();

	const displayLabel = isAtFit ? "Fit" : `${zoomPercent}%`;

	const onValueChange = (value: string) => {
		if (value === "fit") {
			fitToScreen();
		} else {
			setViewportPercent({ percent: Number(value) });
		}
	};

	return (
		<Select
			value={isAtFit ? "fit" : String(zoomPercent)}
			onValueChange={onValueChange}
		>
			<SelectTrigger className="tabular-nums">{displayLabel}</SelectTrigger>
			<SelectContent>
				<SelectItem value="fit">Fit</SelectItem>
				<SelectSeparator />
				{PREVIEW_ZOOM_PRESETS.map((preset) => (
					<SelectItem key={preset} value={String(preset)}>
						{preset}%
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function SafeZoneButton() {
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const activeTemplateId =
		SAFE_ZONE_TEMPLATE_IDS.find((templateId) =>
			isPreviewOverlayVisible({
				overlay: SAFE_ZONE_TEMPLATES[templateId].overlay,
				overlays,
			}),
		) ?? "none";

	const selectTemplate = (value: string) => {
		for (const templateId of SAFE_ZONE_TEMPLATE_IDS) {
			setOverlayVisibility({
				overlayId: SAFE_ZONE_TEMPLATES[templateId].overlay.id,
				isVisible: templateId === (value as SafeZoneTemplateId),
			});
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={activeTemplateId === "none" ? "text" : "secondary"}
					title="Safe zone"
				>
					<HugeiconsIcon icon={SquareIcon} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					value={activeTemplateId}
					onValueChange={selectTemplate}
				>
					<DropdownMenuRadioItem value="none">No safe zone</DropdownMenuRadioItem>
					{SAFE_ZONE_TEMPLATE_IDS.map((templateId) => (
						<DropdownMenuRadioItem key={templateId} value={templateId}>
							{SAFE_ZONE_TEMPLATES[templateId].overlay.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function PlayPauseButton() {
	const isPlaying = useEditor((e) => e.playback.getIsPlaying());

	return (
		<Button
			variant="text"
			size="icon"
			onClick={() => invokeAction("toggle-play")}
		>
			<HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} />
		</Button>
	);
}
