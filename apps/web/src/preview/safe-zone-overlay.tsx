import type {
	PreviewOverlayDefinition,
	PreviewOverlaySourceResult,
} from "@/preview/overlays";

export const SAFE_ZONE_OVERLAY_ID = "shorts-safe-zone";

export const safeZonePreviewOverlay: PreviewOverlayDefinition = {
	id: SAFE_ZONE_OVERLAY_ID,
	label: "Safe zone (Shorts)",
	defaultVisible: false,
};

/**
 * Regions measured in pixels on a YouTube Shorts safe-area template, relative
 * to the video frame drawn on it (the dashed outline), so they scale to any
 * canvas size.
 */
const TEMPLATE = { left: 33, top: 44, width: 251, height: 490 };
const SAFE_AREA = { left: 38, top: 83, right: 279, bottom: 475 };
/** Like / dislike / comment / share column, which covers the safe area's lower right. */
const INTERACTION_BUTTONS = { left: 242, top: 224, right: 279, bottom: 475 };

const UNSAFE_FILL = "rgba(10, 130, 220, 0.45)";
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
	const toX = (templateX: number) => (templateX - TEMPLATE.left) * scaleX;
	const toY = (templateY: number) => (templateY - TEMPLATE.top) * scaleY;
	const safe = {
		left: toX(SAFE_AREA.left),
		top: toY(SAFE_AREA.top),
		right: toX(SAFE_AREA.right),
		bottom: toY(SAFE_AREA.bottom),
	};
	const buttons = {
		left: toX(INTERACTION_BUTTONS.left),
		top: toY(INTERACTION_BUTTONS.top),
	};
	// Safe area outline with the buttons notch cut out of its lower right.
	const safeOutline = `M${safe.left} ${safe.top}H${safe.right}V${buttons.top}H${buttons.left}V${safe.bottom}H${safe.left}Z`;
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
				d={`M0 0H${width}V${height}H0Z ${safeOutline}`}
			/>
			<path
				d={safeOutline}
				fill="none"
				stroke={OUTLINE}
				strokeWidth={1}
				strokeDasharray="6 4"
			/>
			<text
				x={(safe.left + buttons.left) / 2}
				y={(safe.top + safe.bottom) / 2}
				textAnchor="middle"
				fill={OUTLINE}
				fontSize={fontSize}
				style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)", strokeWidth: 2 }}
			>
				Safe zone
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
