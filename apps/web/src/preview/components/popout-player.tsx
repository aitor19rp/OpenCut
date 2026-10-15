"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { mediaTime } from "@/wasm";
import { cn } from "@/utils/ui";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { invokeAction } from "@/actions";
import { PlayPauseButton, TimecodeDisplay } from "./toolbar";

const POPOUT_DEFAULT_WIDTH = 640;
const POPOUT_TOOLBAR_HEIGHT = 56;
const POPOUT_TIMELINE_HEIGHT = 96;

interface DocumentPictureInPicture {
	requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
	window: Window | null;
}

function getDocumentPictureInPicture(): DocumentPictureInPicture | null {
	if (typeof window === "undefined") return null;
	return (
		(window as Window & { documentPictureInPicture?: DocumentPictureInPicture })
			.documentPictureInPicture ?? null
	);
}

function copyDocumentStyles({ target }: { target: Document }): void {
	for (const styleSheet of Array.from(document.styleSheets)) {
		try {
			const cssText = Array.from(styleSheet.cssRules)
				.map((rule) => rule.cssText)
				.join("\n");
			const style = target.createElement("style");
			style.textContent = cssText;
			target.head.appendChild(style);
		} catch {
			// Cross-origin sheets can't be read; link them instead.
			if (!styleSheet.href) continue;
			const link = target.createElement("link");
			link.rel = "stylesheet";
			link.href = styleSheet.href;
			target.head.appendChild(link);
		}
	}
	target.documentElement.className = document.documentElement.className;
	target.body.className = document.body.className;
}

export function usePreviewPopout({
	canvasWidth,
	canvasHeight,
}: {
	canvasWidth: number;
	canvasHeight: number;
}) {
	const [popoutWindow, setPopoutWindow] = useState<Window | null>(null);

	const openPopout = useCallback(async () => {
		const documentPictureInPicture = getDocumentPictureInPicture();
		if (!documentPictureInPicture) {
			toast.error("Pop-out player is not supported in this browser", {
				description: "Use a recent version of Chrome or Edge.",
			});
			return;
		}

		const aspectRatio = canvasHeight / canvasWidth || 9 / 16;
		const pipWindow = await documentPictureInPicture.requestWindow({
			width: POPOUT_DEFAULT_WIDTH,
			height:
				Math.round(POPOUT_DEFAULT_WIDTH * aspectRatio) +
				POPOUT_TOOLBAR_HEIGHT +
				POPOUT_TIMELINE_HEIGHT,
		});
		pipWindow.document.title = "OpenCut Player";
		copyDocumentStyles({ target: pipWindow.document });
		pipWindow.addEventListener("pagehide", () => setPopoutWindow(null), {
			once: true,
		});
		setPopoutWindow(pipWindow);
	}, [canvasWidth, canvasHeight]);

	const closePopout = useCallback(() => {
		popoutWindow?.close();
		setPopoutWindow(null);
	}, [popoutWindow]);

	const togglePopout = useCallback(() => {
		if (popoutWindow) {
			closePopout();
			return;
		}
		openPopout().catch((error: unknown) => {
			console.error("Failed to open pop-out player", error);
			toast.error("Could not open the pop-out player");
		});
	}, [popoutWindow, openPopout, closePopout]);

	useEffect(() => {
		return () => {
			popoutWindow?.close();
		};
	}, [popoutWindow]);

	return { popoutWindow, isPoppedOut: popoutWindow !== null, togglePopout };
}

export function PopoutPlayerPortal({
	popoutWindow,
	canvasRef,
	width,
	height,
}: {
	popoutWindow: Window | null;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	width: number;
	height: number;
}) {
	if (!popoutWindow) return null;
	return createPortal(
		<PopoutPlayer
			popoutWindow={popoutWindow}
			canvasRef={canvasRef}
			width={width}
			height={height}
		/>,
		popoutWindow.document.body,
	);
}

function PopoutPlayer({
	popoutWindow,
	canvasRef,
	width,
	height,
}: {
	popoutWindow: Window;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	width: number;
	height: number;
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest("input, textarea")) return;
			if (event.code === "Space") {
				event.preventDefault();
				invokeAction("toggle-play");
			}
		};
		popoutWindow.addEventListener("keydown", onKeyDown);
		return () => popoutWindow.removeEventListener("keydown", onKeyDown);
	}, [popoutWindow]);

	return (
		<div className="bg-background flex h-screen w-screen flex-col">
			<div className="flex min-h-0 flex-1 items-center justify-center bg-black">
				<canvas
					ref={canvasRef}
					width={width}
					height={height}
					className="size-full object-contain"
				/>
			</div>
			<div
				className="grid grid-cols-[1fr_auto_1fr] items-center px-4"
				style={{ height: POPOUT_TOOLBAR_HEIGHT }}
			>
				<TimecodeDisplay />
				<PlayPauseButton />
				<div />
			</div>
			<PopoutTimeline />
		</div>
	);
}

/**
 * Compact, read-only overview of the timeline for the pop-out window: one row
 * per track with its clips, the playhead, and click/drag to seek.
 */
function PopoutTimeline() {
	const editor = useEditor();
	const tracks = useEditor(
		(e) => e.timeline.getPreviewTracks() ?? e.scenes.getActiveScene().tracks,
	);
	const totalDuration = useEditor((e) => e.timeline.getTotalDuration());
	const [currentTime, setCurrentTime] = useState(() =>
		editor.playback.getCurrentTime(),
	);
	const areaRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const unsubscribeUpdate = editor.playback.onUpdate(setCurrentTime);
		const unsubscribeSeek = editor.playback.onSeek(setCurrentTime);
		return () => {
			unsubscribeUpdate();
			unsubscribeSeek();
		};
	}, [editor.playback]);

	const rows = [...tracks.overlay, tracks.main, ...tracks.audio].filter(
		(track) => track.elements.length > 0,
	);
	const toPercent = (time: number) =>
		totalDuration > 0 ? (time / totalDuration) * 100 : 0;

	const seekToPointer = (event: React.PointerEvent<HTMLDivElement>) => {
		const area = areaRef.current;
		if (!area || totalDuration <= 0) return;
		const rect = area.getBoundingClientRect();
		const ratio = Math.min(
			1,
			Math.max(0, (event.clientX - rect.left) / rect.width),
		);
		editor.playback.seek({
			time: mediaTime({ ticks: Math.round(ratio * totalDuration) }),
		});
	};

	return (
		<div className="border-t px-4 py-2" style={{ height: POPOUT_TIMELINE_HEIGHT }}>
			<div
				ref={areaRef}
				role="slider"
				aria-label="Timeline"
				aria-valuemin={0}
				aria-valuemax={totalDuration}
				aria-valuenow={currentTime}
				tabIndex={0}
				className="relative flex h-full cursor-pointer touch-none flex-col justify-center gap-1"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					seekToPointer(event);
				}}
				onPointerMove={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) {
						seekToPointer(event);
					}
				}}
			>
				{rows.map((track) => (
					<div key={track.id} className="bg-muted relative h-3 rounded-sm">
						{track.elements.map((element) => (
							<div
								key={element.id}
								className={cn(
									"absolute inset-y-0 rounded-sm",
									track.type === "audio"
										? "bg-emerald-500/70"
										: track.type === "text"
											? "bg-violet-500/70"
											: "bg-sky-500/70",
								)}
								style={{
									left: `${toPercent(element.startTime)}%`,
									width: `${toPercent(element.duration)}%`,
								}}
							/>
						))}
					</div>
				))}
				<div
					className="bg-primary pointer-events-none absolute inset-y-0 w-0.5"
					style={{ left: `${toPercent(currentTime)}%` }}
				/>
			</div>
		</div>
	);
}

/**
 * Copies the compositor output into the pop-out canvas. Must run right after
 * a render, while the GPU-backed output canvas still holds the frame.
 */
export function copyFrameToPopout({
	source,
	target,
}: {
	source: HTMLCanvasElement;
	target: HTMLCanvasElement | null;
}): void {
	if (!target) return;
	const ctx = target.getContext("2d");
	if (!ctx) return;
	ctx.drawImage(source, 0, 0, target.width, target.height);
}
