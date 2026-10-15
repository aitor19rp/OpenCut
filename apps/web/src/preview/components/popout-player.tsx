"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { invokeAction } from "@/actions";
import { PlayPauseButton, TimecodeDisplay } from "./toolbar";

const POPOUT_DEFAULT_WIDTH = 640;
const POPOUT_TOOLBAR_HEIGHT = 56;

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
				Math.round(POPOUT_DEFAULT_WIDTH * aspectRatio) + POPOUT_TOOLBAR_HEIGHT,
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
