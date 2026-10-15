import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import type { TTimelineViewState } from "@/project/types";
import type { BlendMode, Transform } from "@/rendering";
import { ZERO_MEDIA_TIME } from "@/wasm";
import type { TextElement } from "./types";

const defaultTransform: Transform = {
	scaleX: 1,
	scaleY: 1,
	position: { x: 0, y: 0 },
	rotate: 0,
};

const defaultOpacity = 1;
const defaultBlendMode: BlendMode = "normal";
const defaultVolume = 0;

const defaultTextLetterSpacing = 0;
const defaultTextLineHeight = 1.2;

const defaultTextBackground = {
	enabled: false,
	color: "#000000",
	cornerRadius: 0,
	paddingX: 30,
	paddingY: 42,
	offsetX: 0,
	offsetY: 0,
};

const defaultTextStroke = {
	enabled: false,
	color: "#000000",
	width: 10,
};

export const DEFAULT_TEXT_FONT_FAMILY = "TikTok Sans";

const defaultTextElement: Omit<TextElement, "id"> = {
	type: "text",
	name: "Text",
	content: "Default text",
	fontSize: 15,
	fontFamily: DEFAULT_TEXT_FONT_FAMILY,
	color: "#ffffff",
	background: { ...defaultTextBackground },
	stroke: { ...defaultTextStroke, enabled: true },
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	letterSpacing: defaultTextLetterSpacing,
	lineHeight: defaultTextLineHeight,
	duration: DEFAULT_NEW_ELEMENT_DURATION,
	startTime: ZERO_MEDIA_TIME,
	trimStart: ZERO_MEDIA_TIME,
	trimEnd: ZERO_MEDIA_TIME,
	transform: {
		...defaultTransform,
		// New texts start at 30% width and height.
		scaleX: 0.3,
		scaleY: 0.3,
		position: { ...defaultTransform.position },
	},
	opacity: defaultOpacity,
};

const defaultTimelineViewState: TTimelineViewState = {
	zoomLevel: 1,
	scrollLeft: 0,
	playheadTime: ZERO_MEDIA_TIME,
};

export const DEFAULTS = {
	element: {
		transform: defaultTransform,
		opacity: defaultOpacity,
		blendMode: defaultBlendMode,
		volume: defaultVolume,
	},
	text: {
		letterSpacing: defaultTextLetterSpacing,
		lineHeight: defaultTextLineHeight,
		background: defaultTextBackground,
		stroke: defaultTextStroke,
		element: defaultTextElement,
	},
	timeline: {
		viewState: defaultTimelineViewState,
	},
};
