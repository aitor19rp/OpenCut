import type { TProject } from "@/project/types";
import type { SceneTracks, TScene } from "@/timeline";
import { generateUUID } from "@/utils/id";

/**
 * Project templates live in this browser's storage. A template keeps the
 * layout of a project (texts, stickers, graphics, effects, canvas settings)
 * but not the video, image or audio clips: those are replaced each time.
 */

const TEMPLATES_STORAGE_KEY = "opencut-project-templates";

export interface ProjectTemplate {
	id: string;
	name: string;
	createdAt: string;
	scenes: TScene[];
	settings: TProject["settings"];
}

const MEDIA_ELEMENT_TYPES = new Set(["video", "image", "audio"]);

function stripMedia({ tracks }: { tracks: SceneTracks }): SceneTracks {
	const strip = <TTrack extends { elements: Array<{ type: string }> }>(
		track: TTrack,
	): TTrack => ({
		...track,
		elements: track.elements.filter(
			(element) => !MEDIA_ELEMENT_TYPES.has(element.type),
		),
	});
	return {
		overlay: tracks.overlay.map(strip),
		main: strip(tracks.main),
		audio: tracks.audio.map(strip),
	} as SceneTracks;
}

export function buildTemplateFromProject({
	project,
	name,
}: {
	project: TProject;
	name: string;
}): ProjectTemplate {
	return {
		id: generateUUID(),
		name,
		createdAt: new Date().toISOString(),
		scenes: project.scenes.map((scene) => ({
			...scene,
			tracks: stripMedia({ tracks: scene.tracks }),
		})),
		settings: project.settings,
	};
}

export function listTemplates(): ProjectTemplate[] {
	try {
		const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? (parsed as ProjectTemplate[]) : [];
	} catch {
		return [];
	}
}

function writeTemplates({ templates }: { templates: ProjectTemplate[] }): void {
	localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

export function saveTemplate({ template }: { template: ProjectTemplate }): void {
	writeTemplates({ templates: [template, ...listTemplates()] });
}

export function deleteTemplate({ id }: { id: string }): void {
	writeTemplates({
		templates: listTemplates().filter((template) => template.id !== id),
	});
}
