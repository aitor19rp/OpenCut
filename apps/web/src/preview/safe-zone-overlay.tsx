import type {
	PreviewOverlayDefinition,
	PreviewOverlaySourceResult,
} from "@/preview/overlays";

/**
 * A safe-zone template in its own pixel space. `frame` is the video area in
 * that space; the safe outline is a polygon (in order) inside it. Everything
 * is scaled to the canvas, so any aspect ratio works.
 */
interface SafeZoneTemplate {
	overlay: PreviewOverlayDefinition;
	frame: { left: number; top: number; width: number; height: number };
	safeOutline: Array<{ x: number; y: number }>;
}

export const SAFE_ZONE_TEMPLATES = {
	/**
	 * Instagram boosted Reels spec on 1080×1920: about 1010×1280, 220 px from
	 * the top and 420 px from the bottom (35 px side margins).
	 */
	reels: {
		overlay: {
			id: "reels-safe-zone",
			label: "Safe zone (Instagram Reels)",
			defaultVisible: false,
		},
		frame: { left: 0, top: 0, width: 1080, height: 1920 },
		safeOutline: [
			{ x: 35, y: 220 },
			{ x: 1045, y: 220 },
			{ x: 1045, y: 1500 },
			{ x: 35, y: 1500 },
		],
	},
} satisfies Record<string, SafeZoneTemplate>;

export type SafeZoneTemplateId = keyof typeof SAFE_ZONE_TEMPLATES;

export const SAFE_ZONE_TEMPLATE_IDS = Object.keys(
	SAFE_ZONE_TEMPLATES,
) as SafeZoneTemplateId[];

const UNSAFE_FILL = "rgba(10, 130, 220, 0.45)";
const OUTLINE = "rgba(255, 255, 255, 0.9)";

export function SafeZoneOverlay({
	template,
	width,
	height,
	fillContainer = false,
}: {
	template: SafeZoneTemplate;
	width: number;
	height: number;
	/** Stretch to the parent's size instead of using width/height in pixels. */
	fillContainer?: boolean;
}) {
	const { frame } = template;
	const points = template.safeOutline.map((point) => ({
		x: ((point.x - frame.left) / frame.width) * width,
		y: ((point.y - frame.top) / frame.height) * height,
	}));
	const outline = `M${points.map((point) => `${point.x} ${point.y}`).join("L")}Z`;

	return (
		<svg
			width={fillContainer ? "100%" : width}
			height={fillContainer ? "100%" : height}
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			className="pointer-events-none absolute inset-0"
			aria-hidden="true"
		>
			{/* Everything outside the safe area, drawn with an even-odd hole. */}
			<path
				fillRule="evenodd"
				fill={UNSAFE_FILL}
				d={`M0 0H${width}V${height}H0Z ${outline}`}
			/>
			<path
				d={outline}
				fill="none"
				stroke={OUTLINE}
				strokeWidth={1}
				strokeDasharray="6 4"
			/>
		</svg>
	);
}

export function getSafeZonePreviewOverlaySource({
	visibleTemplateIds,
}: {
	visibleTemplateIds: SafeZoneTemplateId[];
}): PreviewOverlaySourceResult {
	return {
		// Toggled from the preview toolbar only, so not listed in the context menu.
		definitions: [],
		instances: visibleTemplateIds.map((templateId) => {
			const template = SAFE_ZONE_TEMPLATES[templateId];
			return {
				id: template.overlay.id,
				mount: { kind: "scene" as const },
				plane: "under-interaction" as const,
				pointerEvents: "none" as const,
				render: ({
					sceneWidth,
					sceneHeight,
				}: {
					sceneWidth: number;
					sceneHeight: number;
				}) => (
					<SafeZoneOverlay
						template={template}
						width={sceneWidth}
						height={sceneHeight}
					/>
				),
			};
		}),
	};
}
