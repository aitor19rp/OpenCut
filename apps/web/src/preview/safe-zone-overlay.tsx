import type {
	PreviewOverlayDefinition,
	PreviewOverlaySourceResult,
} from "@/preview/overlays";

export const SAFE_ZONE_OVERLAY_ID = "instagram-safe-zone";

export const safeZonePreviewOverlay: PreviewOverlayDefinition = {
	id: SAFE_ZONE_OVERLAY_ID,
	label: "Safe zone (Instagram)",
	defaultVisible: false,
};

/**
 * Regions measured on a 1080×1920 Instagram safe-zone template, stored as
 * fractions of the frame so they scale to any canvas size.
 */
const TEMPLATE = { width: 1080, height: 1920 };
const SAFE_AREA = { left: 61, top: 153, right: 1019, bottom: 1510 };
const INTERACTION_BUTTONS = { left: 835, top: 1206, right: 1019, bottom: 1510 };

const UNSAFE_FILL = "rgba(10, 130, 220, 0.45)";
const PARTLY_SAFE_FILL = "rgba(95, 170, 230, 0.45)";
const OUTLINE = "rgba(255, 255, 255, 0.9)";

function SafeZoneOverlay({
	width,
	height,
}: {
	width: number;
	height: number;
}) {
	const scaleX = width / TEMPLATE.width;
	const scaleY = height / TEMPLATE.height;
	const safe = {
		x: SAFE_AREA.left * scaleX,
		y: SAFE_AREA.top * scaleY,
		width: (SAFE_AREA.right - SAFE_AREA.left) * scaleX,
		height: (SAFE_AREA.bottom - SAFE_AREA.top) * scaleY,
	};
	const buttons = {
		x: INTERACTION_BUTTONS.left * scaleX,
		y: INTERACTION_BUTTONS.top * scaleY,
		width: (INTERACTION_BUTTONS.right - INTERACTION_BUTTONS.left) * scaleX,
		height: (INTERACTION_BUTTONS.bottom - INTERACTION_BUTTONS.top) * scaleY,
	};
	const fontSize = Math.max(9, Math.min(14, width / 28));

	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className="pointer-events-none absolute inset-0"
			aria-hidden="true"
		>
			{/* Everything outside the safe area, drawn with an even-odd hole. */}
			<path
				fillRule="evenodd"
				fill={UNSAFE_FILL}
				d={`M0 0H${width}V${height}H0Z M${safe.x} ${safe.y}V${safe.y + safe.height}H${safe.x + safe.width}V${safe.y}Z`}
			/>
			<rect
				x={buttons.x}
				y={buttons.y}
				width={buttons.width}
				height={buttons.height}
				rx={Math.min(buttons.width, buttons.height) * 0.15}
				fill={PARTLY_SAFE_FILL}
			/>
			<rect
				x={safe.x}
				y={safe.y}
				width={safe.width}
				height={safe.height}
				fill="none"
				stroke={OUTLINE}
				strokeWidth={1}
				strokeDasharray="6 4"
			/>
			<text
				x={safe.x + fontSize * 0.5}
				y={safe.y + fontSize * 1.3}
				fill={OUTLINE}
				fontSize={fontSize}
				style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)", strokeWidth: 2 }}
			>
				Safe zone
			</text>
			<text
				x={safe.x + fontSize * 0.5}
				y={safe.y + safe.height + fontSize * 1.4}
				fill={OUTLINE}
				fontSize={fontSize}
			>
				Partly safe (caption, username)
			</text>
		</svg>
	);
}

export function getSafeZonePreviewOverlaySource({
	isVisible,
}: {
	isVisible: boolean;
}): PreviewOverlaySourceResult {
	return {
		definitions: [safeZonePreviewOverlay],
		instances: isVisible
			? [
					{
						id: SAFE_ZONE_OVERLAY_ID,
						mount: { kind: "scene" },
						plane: "under-interaction",
						pointerEvents: "none",
						render: ({ sceneWidth, sceneHeight }) => (
							<SafeZoneOverlay width={sceneWidth} height={sceneHeight} />
						),
					},
				]
			: [],
	};
}
