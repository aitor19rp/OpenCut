"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SmileIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/ui";

interface EmojiEntry {
	unicode: string;
	label: string;
	tags: string[];
	group: number;
}

interface EmojiGroup {
	key: number;
	label: string;
	emojis: EmojiEntry[];
}

/** Emojibase "component" group: skin tones and hair parts, not standalone emojis. */
const COMPONENT_GROUP = 2;

const RECENT_EMOJIS_KEY = "opencut-recent-emojis";
const RECENT_EMOJIS_LIMIT = 24;

function readRecentEmojis(): string[] {
	try {
		const raw = localStorage.getItem(RECENT_EMOJIS_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

function saveRecentEmoji({ emoji }: { emoji: string }): string[] {
	const next = [emoji, ...readRecentEmojis().filter((item) => item !== emoji)].slice(
		0,
		RECENT_EMOJIS_LIMIT,
	);
	try {
		localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(next));
	} catch {
		// Storage unavailable: recents just won't persist.
	}
	return next;
}

let emojiGroupsPromise: Promise<EmojiGroup[]> | null = null;

function loadEmojiGroups(): Promise<EmojiGroup[]> {
	if (!emojiGroupsPromise) {
		emojiGroupsPromise = Promise.all([
			import("emojibase-data/es/compact.json"),
			import("emojibase-data/es/messages.json"),
		]).then(([compactModule, messagesModule]) => {
			const isSupported = createEmojiSupportChecker();
			const groups = new Map<number, EmojiGroup>();
			for (const group of messagesModule.default.groups) {
				if (group.order === COMPONENT_GROUP) continue;
				groups.set(group.order, {
					key: group.order,
					label: group.message,
					emojis: [],
				});
			}
			for (const emoji of compactModule.default) {
				if (emoji.group === undefined) continue;
				const group = groups.get(emoji.group);
				if (!group || !isSupported(emoji.unicode)) continue;
				group.emojis.push({
					unicode: emoji.unicode,
					label: emoji.label,
					tags: emoji.tags ?? [],
					group: emoji.group,
				});
			}
			return [...groups.values()].filter((group) => group.emojis.length > 0);
		});
	}
	return emojiGroupsPromise;
}

/**
 * Detects emojis the system font can't draw (newer than the OS), which would
 * otherwise show up as empty boxes or as several glyphs side by side.
 */
function createEmojiSupportChecker(): (emoji: string) => boolean {
	const size = 32;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return () => true;

	ctx.font = `${size - 8}px sans-serif`;
	ctx.textBaseline = "top";
	const singleWidth = ctx.measureText("😀").width;

	const draw = (text: string) => {
		ctx.clearRect(0, 0, size, size);
		ctx.fillText(text, 0, 0);
		return ctx.getImageData(0, 0, size, size).data;
	};
	const missingGlyph = draw("\u{10FFFD}");

	return (emoji) => {
		if (ctx.measureText(emoji).width > singleWidth * 1.5) return false;
		const pixels = draw(emoji);
		for (let index = 0; index < pixels.length; index++) {
			if (pixels[index] !== missingGlyph[index]) return true;
		}
		return false;
	};
}

function normalizeSearch(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");
}

/** Lower is better; null when the emoji doesn't match at all. */
function getSearchRank({
	emoji,
	query,
}: {
	emoji: EmojiEntry;
	query: string;
}): number | null {
	const label = normalizeSearch(emoji.label);
	if (label === query) return 0;
	if (label.startsWith(query)) return 1;
	if (label.includes(query)) return 2;
	if (emoji.tags.some((tag) => normalizeSearch(tag).includes(query))) return 3;
	return null;
}

export function EmojiPickerButton({
	onSelect,
	onOpen,
}: {
	onSelect: ({ emoji }: { emoji: string }) => void;
	onOpen?: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) onOpen?.();
				setOpen(nextOpen);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					title="Insert emoji"
					onClick={(event) => event.stopPropagation()}
				>
					<HugeiconsIcon icon={SmileIcon} strokeWidth={1.5} />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				{open && <EmojiPickerContent onSelect={onSelect} />}
			</PopoverContent>
		</Popover>
	);
}

function EmojiPickerContent({
	onSelect,
}: {
	onSelect: ({ emoji }: { emoji: string }) => void;
}) {
	const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
	const [search, setSearch] = useState("");
	const [recentEmojis, setRecentEmojis] = useState<string[]>(() =>
		readRecentEmojis(),
	);
	const scrollRef = useRef<HTMLDivElement>(null);

	const handleSelect = ({ emoji }: { emoji: string }) => {
		setRecentEmojis(saveRecentEmoji({ emoji }));
		onSelect({ emoji });
	};

	useEffect(() => {
		let cancelled = false;
		loadEmojiGroups().then((loaded) => {
			if (!cancelled) setGroups(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const query = normalizeSearch(search.trim());
	const searchResults = useMemo(() => {
		if (!groups || !query) return null;
		return groups
			.flatMap((group) => group.emojis)
			.map((emoji) => ({ emoji, rank: getSearchRank({ emoji, query }) }))
			.filter((result): result is { emoji: EmojiEntry; rank: number } =>
				result.rank !== null,
			)
			.sort((a, b) => a.rank - b.rank)
			.map((result) => result.emoji);
	}, [groups, query]);

	// Recents the system can still draw, in most-recent-first order.
	const recentEntries = useMemo(() => {
		if (!groups) return [];
		const byUnicode = new Map(
			groups.flatMap((group) => group.emojis).map((emoji) => [emoji.unicode, emoji]),
		);
		return recentEmojis
			.map((unicode) => byUnicode.get(unicode))
			.filter((emoji): emoji is EmojiEntry => emoji !== undefined);
	}, [groups, recentEmojis]);

	const scrollToGroup = ({ groupKey }: { groupKey: number }) => {
		const target = scrollRef.current?.querySelector<HTMLElement>(
			`[data-emoji-group="${groupKey}"]`,
		);
		if (target && scrollRef.current) {
			scrollRef.current.scrollTop = target.offsetTop;
		}
	};

	return (
		<div className="flex flex-col">
			<div className="border-b p-2">
				<Input
					autoFocus
					placeholder="Buscar emoji…"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
				/>
			</div>
			<div className="border-b px-2 py-1">
				<p className="text-muted-foreground pb-1 text-xs">Recientes</p>
				{recentEntries.length > 0 ? (
					<div className="grid grid-cols-8">
						{recentEntries.slice(0, 16).map((emoji) => (
							<button
								key={emoji.unicode}
								type="button"
								title={emoji.label}
								className="hover:bg-accent flex aspect-square items-center justify-center rounded text-2xl leading-none"
								onClick={() => handleSelect({ emoji: emoji.unicode })}
							>
								{emoji.unicode}
							</button>
						))}
					</div>
				) : (
					<p className="text-muted-foreground pb-1 text-xs">
						Aún no hay emojis recientes
					</p>
				)}
			</div>
			{!query && groups && (
				<div className="flex justify-between border-b px-1 py-1">
					{groups.map((group) => (
						<button
							key={group.key}
							type="button"
							title={group.label}
							className="hover:bg-accent rounded p-1 text-lg leading-none"
							onClick={() => scrollToGroup({ groupKey: group.key })}
						>
							{group.emojis[0]?.unicode}
						</button>
					))}
				</div>
			)}
			<div ref={scrollRef} className="relative h-72 overflow-y-auto p-2">
				{!groups && (
					<p className="text-muted-foreground p-2 text-sm">Cargando…</p>
				)}
				{searchResults && (
					<EmojiGrid emojis={searchResults} onSelect={handleSelect} />
				)}
				{searchResults?.length === 0 && (
					<p className="text-muted-foreground p-2 text-sm">
						No se ha encontrado ningún emoji
					</p>
				)}
				{!searchResults &&
					groups?.map((group) => (
						<div key={group.key} data-emoji-group={group.key}>
							<p className="text-muted-foreground px-1 pb-1 pt-2 text-xs first-letter:uppercase">
								{group.label}
							</p>
							<EmojiGrid emojis={group.emojis} onSelect={handleSelect} />
						</div>
					))}
			</div>
		</div>
	);
}

function EmojiGrid({
	emojis,
	onSelect,
}: {
	emojis: EmojiEntry[];
	onSelect: ({ emoji }: { emoji: string }) => void;
}) {
	return (
		<div className="grid grid-cols-8">
			{emojis.map((emoji) => (
				<button
					key={emoji.unicode}
					type="button"
					title={emoji.label}
					className={cn(
						"hover:bg-accent flex aspect-square items-center justify-center rounded text-2xl leading-none",
					)}
					onClick={() => onSelect({ emoji: emoji.unicode })}
				>
					{emoji.unicode}
				</button>
			))}
		</div>
	);
}
