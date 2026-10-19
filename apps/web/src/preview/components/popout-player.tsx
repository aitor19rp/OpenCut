"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { mediaTime } from "@/wasm";
import { cn } from "@/utils/ui";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { invokeAction } from "@/actions";
import {
	PlayPauseButton,
	RestartButton,
	SafeZoneButton,
	TimecodeDisplay,
} from "./toolbar";
import { usePreviewStore } from "@/preview/preview-store";
import { isPreviewOverlayVisible } from "@/preview/overlays";
import { SAFE_ZONE_TEMPLATES, SafeZoneOverlay } from "@/preview/safe-zone-overlay";

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
		const aspectRatio = canvasHeight / canvasWidth || 9 / 16;
		const width = POPOUT_DEFAULT_WIDTH;
		const height =
			Math.round(width * aspectRatio) +
			POPOUT_TOOLBAR_HEIGHT +
			POPOUT_TIMELINE_HEIGHT;

		// Prefer the always-on-top Picture-in-Picture window (Chrome/Edge).
		// Where it isn't available or fails (e.g. the desktop app), fall back
		// to a plain popup window.
		let pipWindow: Window | null = null;
		const documentPictureInPicture = getDocumentPictureInPicture();
		if (documentPictureInPicture) {
			try {
				pipWindow = await documentPictureInPicture.requestWindow({
					width,
					height,
				});
			} catch (error) {
				console.warn("Picture-in-Picture window failed, using popup", error);
			}
		}
		if (!pipWindow) {
			pipWindow = window.open(
				"about:blank",
				"opencut-player",
				`popup=yes,width=${width},height=${height}`,
			);
		}
		if (!pipWindow) {
			toast.error("Could not open the pop-out player", {
				description: "The browser blocked the new window.",
			});
			return;
		}

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
	const isSafeZoneVisible = usePreviewStore((state) =>
		isPreviewOverlayVisible({
			overlay: SAFE_ZONE_TEMPLATES.reels.overlay,
			overlays: state.overlays,
		}),
	);

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
				{/* Sized to the video's aspect ratio so the safe zone lines up with it. */}
				<div
					className="relative max-h-full max-w-full"
					style={{
						aspectRatio: `${width} / ${height}`,
						height: "100%",
					}}
				>
					<canvas
						ref={canvasRef}
						width={width}
						height={height}
						className="size-full"
					/>
					{isSafeZoneVisible && (
						<SafeZoneOverlay
							template={SAFE_ZONE_TEMPLATES.reels}
							width={width}
							height={height}
							fillContainer
						/>
					)}
				</div>
			</div>
			<div
				className="grid grid-cols-[1fr_auto_1fr] items-center px-4"
				style={{ height: POPOUT_TOOLBAR_HEIGHT }}
			>
				<TimecodeDisplay />
				<div className="flex items-center gap-1">
					<RestartButton />
					<PlayPauseButton />
				</div>
				<div className="justify-self-end">
					<SafeZoneButton />
				</div>
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
