"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TranslateIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { distributeIntoLines, splitParagraphs } from "@/text/translate-layout";
import { detectLanguage, type TranslationLanguage } from "@/text/detect-language";
import { translateLocally } from "@/text/local-translator";
import {
	DeepLError,
	describeDeepLError,
	getDeepLApiKey,
	translateWithDeepL,
} from "@/text/deepl";
import { DeepLSettingsDialog } from "./deepl-settings-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Chrome's built-in, on-device Translator API. Not in the TS DOM lib yet, so
 * only the parts used here are typed.
 */
interface BrowserTranslator {
	translate(text: string): Promise<string>;
	destroy?(): void;
}

interface TranslatorFactory {
	availability(options: {
		sourceLanguage: string;
		targetLanguage: string;
	}): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
	create(options: {
		sourceLanguage: string;
		targetLanguage: string;
	}): Promise<BrowserTranslator>;
}

function getTranslatorFactory(): TranslatorFactory | null {
	if (typeof window === "undefined") return null;
	return (
		(window as Window & { Translator?: TranslatorFactory }).Translator ?? null
	);
}

const LANGUAGES = [
	{ code: "es", label: "Español" },
	{ code: "de", label: "Alemán" },
	{ code: "en", label: "Inglés (EE. UU.)" },
] as const;

type LanguageCode = TranslationLanguage;

/** Language download on first use can be slow, but shouldn't hang forever. */
const TRANSLATOR_SETUP_TIMEOUT_MS = 120_000;

function withTimeout<T>({
	promise,
	ms,
}: {
	promise: Promise<T>;
	ms: number;
}): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("Translator setup timed out")),
			ms,
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/**
 * Prefers Chrome's built-in translator when it's ready to use right away;
 * otherwise (other browsers, the desktop app) uses the offline models.
 */
async function createTextTranslator({
	source,
	target,
	apiKey,
}: {
	source: LanguageCode;
	target: LanguageCode;
	apiKey: string | null;
}): Promise<(text: string) => Promise<string>> {
	if (apiKey) {
		// DeepL detects the source language itself. If it is unreachable the
		// offline models take over.
		let deeplFailed = false;
		let fallback: ((text: string) => Promise<string>) | null = null;
		return async (text) => {
			if (!deeplFailed) {
				try {
					const result = await translateWithDeepL({ text, target, apiKey });
					return result.detectedSourceLanguage.startsWith(target)
						? text
						: result.text;
				} catch (error) {
					if (error instanceof DeepLError) {
						toast.error(describeDeepLError({ code: error.code }));
						if (error.code !== "network") throw error;
					}
					deeplFailed = true;
					toast.info("Uso el traductor integrado (sin DeepL)");
				}
			}
			fallback ??= await createTextTranslator({
				source: detectLanguage({ text }) ?? source,
				target,
				apiKey: null,
			});
			return fallback(text);
		};
	}

	const factory = getTranslatorFactory();
	if (factory) {
		try {
			const options = { sourceLanguage: source, targetLanguage: target };
			if ((await factory.availability(options)) === "available") {
				const translator = await withTimeout({
					promise: factory.create(options),
					ms: TRANSLATOR_SETUP_TIMEOUT_MS,
				});
				return (text) => translator.translate(text);
			}
		} catch {
			// Fall back to the offline models below.
		}
	}

	let isFirstUse = true;
	return (text) =>
		translateLocally({
			text,
			source,
			target,
			onProgress: () => {
				if (!isFirstUse) return;
				isFirstUse = false;
				toast.info("Descargando el modelo de traducción (solo la primera vez)…");
			},
		});
}

export function TranslateButton({
	text,
	onTranslated,
}: {
	text: string;
	onTranslated: ({ text }: { text: string }) => void;
}) {
	const [isTranslating, setIsTranslating] = useState(false);
	const [isDeepLDialogOpen, setIsDeepLDialogOpen] = useState(false);

	const translate = async ({ target }: { target: LanguageCode }) => {
		if (!text.trim()) return;

		setIsTranslating(true);
		try {
			const apiKey = getDeepLApiKey();
			const detected = apiKey ? null : detectLanguage({ text });
			// Without DeepL: short or unusual texts can't be told apart
			// reliably, so guess English (or Spanish when translating to
			// English) and say so.
			const source: LanguageCode = detected ?? (target === "en" ? "es" : "en");
			if (!apiKey && !detected) {
				toast.info(
					`No estaba seguro del idioma; he supuesto ${source === "en" ? "inglés" : "español"}`,
				);
			}
			if (!apiKey && source === target) {
				toast.info("El texto ya está en ese idioma");
				return;
			}

			const translateText = await createTextTranslator({ source, target, apiKey });
			// Translate whole paragraphs, not single lines: a sentence broken
			// over two lines needs its context, then restore the line layout.
			const paragraphs = splitParagraphs({ text });
			const translatedParagraphs: string[][] = [];
			for (const lines of paragraphs) {
				if (lines.length === 1 && !lines[0].trim()) {
					translatedParagraphs.push(lines);
					continue;
				}
				const joined = lines.map((line) => line.trim()).join(" ");
				const translated = await translateText(joined);
				translatedParagraphs.push(
					distributeIntoLines({ translated, originalLines: lines }),
				);
			}
			onTranslated({ text: translatedParagraphs.flat().join("\n") });
		} catch (error) {
			console.error("Translation failed", error);
			// DeepL errors were already explained to the user.
			if (error instanceof DeepLError) return;
			toast.error("No se ha podido traducir el texto", {
				description:
					"Si es la primera vez con este par de idiomas, necesita internet para descargar el modelo (una sola vez).",
			});
		} finally {
			setIsTranslating(false);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						title="Traducir"
						disabled={isTranslating}
						onClick={(event) => event.stopPropagation()}
					>
						<HugeiconsIcon icon={TranslateIcon} strokeWidth={1.5} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{LANGUAGES.map((language) => (
						<DropdownMenuItem
							key={language.code}
							onClick={() => translate({ target: language.code })}
						>
							Traducir a {language.label}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => setIsDeepLDialogOpen(true)}>
						Configurar DeepL…
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeepLSettingsDialog
				open={isDeepLDialogOpen}
				onOpenChange={setIsDeepLDialogOpen}
			/>
		</>
	);
}
