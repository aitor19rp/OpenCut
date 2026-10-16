"use client";

import {
	useState,
	useMemo,
	useRef,
	useEffect,
	useCallback,
	useSyncExternalStore,
	type CSSProperties,
} from "react";
import { List, type RowComponentProps } from "react-window";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadFullFont } from "@/fonts/google-fonts";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import type { FontAtlas, FontAtlasEntry } from "@/fonts/types";
import { useFontAtlas } from "@/fonts/use-font-atlas";
import { cn } from "@/utils/ui";
import { ChevronDown, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, TextIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
	addCustomFontFromFile,
	CUSTOM_FONT_ACCEPT,
	getCustomFontFamilies,
	isCustomFont,
	loadCustomFonts,
	removeCustomFont,
	subscribeCustomFonts,
} from "@/fonts/custom-fonts";

const FONT_TABS = [
	{ key: "all", label: "All fonts" },
	{ key: "my-fonts", label: "My fonts" },
	{ key: "favorites", label: "Favorites" },
] as const;

type FontTab = (typeof FONT_TABS)[number]["key"];

const ROW_HEIGHT = 40;
const PREVIEW_SCALE = 0.8;
const LIST_WIDTH = 288;
const MAX_LIST_HEIGHT = 288;
const OVERSCAN = 15;

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<FontTab>("all");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const { atlas, status, fontNames, retry: handleRetry } = useFontAtlas({ open });

	const filteredFonts = useMemo(() => {
		if (!search) return fontNames;
		const query = search.toLowerCase();
		return fontNames.filter((name) => name.toLowerCase().includes(query));
	}, [fontNames, search]);

	const listHeight = Math.min(
		MAX_LIST_HEIGHT,
		filteredFonts.length * ROW_HEIGHT,
	);

	const handleSelect = useCallback(
		async ({ family }: { family: string }) => {
			if (!SYSTEM_FONTS.has(family) && !isCustomFont(family)) {
				try {
					await loadFullFont({ family });
				} catch {
					// ignore load failure, font will fall back to system default
				}
			}
			onValueChange?.(family);
			setOpen(false);
		},
		[onValueChange],
	);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setActiveTab("all");
		}
	}, [open]);

	const activeTabLabel =
		FONT_TABS.find((t) => t.key === activeTab)?.label.toLowerCase() ?? "";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="text-muted-foreground [&_svg]:size-3.5 shrink-0">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
						{defaultValue ?? "Select a font"}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 p-0 overflow-hidden"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="relative px-3 py-1.5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 shrink-0 opacity-50" />
					<Input
						ref={searchInputRef}
						placeholder={`Search ${activeTabLabel}...`}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						size="xs"
						className="w-full pl-5 bg-transparent border-none! shadow-none!"
					/>
				</div>
				<div className="flex border-b px-3">
					{FONT_TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							className={cn(
								"px-3 py-1.5 text-xs border-b-2 -mb-px",
								activeTab === tab.key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
						</button>
					))}
				</div>
				{activeTab === "my-fonts" && (
					<MyFontsTab
						search={search}
						selectedFont={defaultValue}
						onFontSelect={handleSelect}
					/>
				)}
				{activeTab !== "my-fonts" && status === "loading" && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Loading fonts...
					</div>
				)}
				{activeTab !== "my-fonts" && status === "error" && (
					<div className="flex flex-col items-center gap-3 py-8 px-4">
						<p className="text-sm text-muted-foreground text-center">
							Failed to load font previews.
						</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							Retry
						</Button>
					</div>
				)}
				{activeTab !== "my-fonts" &&
					status === "idle" &&
					fontNames.length > 0 &&
					filteredFonts.length === 0 && (
						<div className="py-6 text-center text-sm text-muted-foreground">
							No fonts found.
						</div>
					)}
				{activeTab !== "my-fonts" &&
					status === "idle" &&
					atlas &&
					filteredFonts.length > 0 && (
					<List
						rowCount={filteredFonts.length}
						rowHeight={ROW_HEIGHT}
						overscanCount={OVERSCAN}
						rowComponent={FontRow}
						rowProps={{
							atlas,
							filteredFonts,
							selectedFont: defaultValue,
							onFontSelect: handleSelect,
						}}
						style={{ height: listHeight, width: LIST_WIDTH }}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}

function MyFontsTab({
	search,
	selectedFont,
	onFontSelect,
}: {
	search: string;
	selectedFont: string | undefined;
	onFontSelect: (params: { family: string }) => void;
}) {
	const fonts = useSyncExternalStore(
		subscribeCustomFonts,
		getCustomFontFamilies,
		getCustomFontFamilies,
	);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);

	useEffect(() => {
		void loadCustomFonts();
	}, []);

	const query = search.toLowerCase();
	const visibleFonts = query
		? fonts.filter((family) => family.toLowerCase().includes(query))
		: fonts;

	const handleFiles = async (files: FileList | null) => {
		if (!files?.length) return;
		setIsUploading(true);
		for (const file of Array.from(files)) {
			try {
				const family = await addCustomFontFromFile({ file });
				toast.success(`Fuente "${family}" añadida`);
			} catch (error) {
				console.error("Failed to add font", error);
				toast.error(`No se ha podido cargar "${file.name}"`, {
					description: "Usa un archivo de fuente .ttf, .otf, .woff o .woff2.",
				});
			}
		}
		setIsUploading(false);
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	return (
		<div className="flex flex-col">
			<div className="border-b p-2">
				<input
					ref={fileInputRef}
					type="file"
					accept={CUSTOM_FONT_ACCEPT}
					multiple
					className="hidden"
					onChange={(event) => handleFiles(event.target.files)}
				/>
				<Button
					variant="outline"
					size="sm"
					className="w-full"
					disabled={isUploading}
					onClick={() => fileInputRef.current?.click()}
				>
					<HugeiconsIcon icon={Upload04Icon} />
					{isUploading ? "Cargando…" : "Subir fuente"}
				</Button>
				<p className="text-muted-foreground mt-1.5 text-[11px] leading-tight">
					Se guarda solo en este navegador. Usa fuentes que tengas permiso para
					usar.
				</p>
			</div>
			{visibleFonts.length === 0 ? (
				<div className="py-6 text-center text-sm text-muted-foreground">
					{fonts.length === 0 ? "Aún no has subido fuentes." : "No fonts found."}
				</div>
			) : (
				<div className="max-h-72 overflow-y-auto">
					{visibleFonts.map((family) => (
						<div
							key={family}
							className={cn(
								"group flex items-center gap-2 px-3 hover:bg-popover-hover",
								family === selectedFont && "bg-popover-hover",
							)}
							style={{ height: ROW_HEIGHT }}
						>
							<button
								type="button"
								className="min-w-0 flex-1 cursor-pointer truncate text-left text-xl text-foreground/85"
								style={{ fontFamily: `"${family}"` }}
								onClick={() => onFontSelect({ family })}
							>
								{family}
							</button>
							<Button
								variant="ghost"
								size="icon"
								title="Quitar fuente"
								className="opacity-0 group-hover:opacity-100"
								onClick={() => removeCustomFont({ family })}
							>
								<HugeiconsIcon icon={Delete02Icon} />
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function FontSpritePreview({ entry }: { entry: FontAtlasEntry }) {
	return (
		<div
			className="shrink-0"
			style={{
				width: entry.w,
				height: ROW_HEIGHT,
				backgroundColor: "currentColor",
				WebkitMaskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				WebkitMaskPosition: `-${entry.x}px -${entry.y}px`,
				WebkitMaskRepeat: "no-repeat",
				maskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				maskPosition: `-${entry.x}px -${entry.y}px`,
				maskRepeat: "no-repeat",
				transform: `scale(${PREVIEW_SCALE})`,
				transformOrigin: "left center",
			}}
		/>
	);
}

type FontRowProps = {
	atlas: FontAtlas;
	filteredFonts: string[];
	selectedFont: string | undefined;
	onFontSelect: (params: { family: string }) => void;
};

function FontRow({
	index,
	style,
	atlas,
	filteredFonts,
	selectedFont,
	onFontSelect,
}: RowComponentProps<FontRowProps>) {
	const fontName = filteredFonts[index];
	const entry = atlas.fonts[fontName];
	const isSelected = fontName === selectedFont;
	const isSystemFont = SYSTEM_FONTS.has(fontName);

	return (
		<button
			type="button"
			style={style as CSSProperties}
			className={cn(
				"flex w-full cursor-pointer items-center gap-2 px-3 outline-hidden hover:bg-popover-hover",
				isSelected && "bg-popover-hover",
			)}
			onClick={() => onFontSelect({ family: fontName })}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onFontSelect({ family: fontName });
				}
			}}
			aria-label={fontName}
		>
			<div className="min-w-0 overflow-hidden">
				{isSystemFont ? (
					<span className="text-xl text-foreground/85" style={{ fontFamily: fontName }}>
						{fontName}
					</span>
				) : (
					<FontSpritePreview entry={entry} />
				)}
			</div>
		</button>
	);
}
