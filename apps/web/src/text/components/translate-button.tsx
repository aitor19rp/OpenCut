"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TranslateIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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

interface LanguageDetectionResult {
	detectedLanguage: string;
	confidence: number;
}

interface BrowserLanguageDetector {
	detect(text: string): Promise<LanguageDetectionResult[]>;
	destroy?(): void;
}

interface LanguageDetectorFactory {
	create(): Promise<BrowserLanguageDetector>;
}

function getLanguageDetectorFactory(): LanguageDetectorFactory | null {
	if (typeof window === "undefined") return null;
	return (
		(window as Window & { LanguageDetector?: LanguageDetectorFactory })
			.LanguageDetector ?? null
	);
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

type LanguageCode = (typeof LANGUAGES)[number]["code"];

/**
 * Detects which of our three languages the text is in. The detector scores
 * every language it knows, so we pick the best-scoring one among ours.
 */
async function detectSourceLanguage({
	text,
}: {
	text: string;
}): Promise<LanguageCode | null> {
	const factory = getLanguageDetectorFactory();
	if (!factory) return null;
	const detector = await factory.create();
	try {
		const results = await detector.detect(text);
		const supported = new Set<string>(LANGUAGES.map((language) => language.code));
		const best = results
			.filter((result) => supported.has(result.detectedLanguage.split("-")[0]))
			.sort((a, b) => b.confidence - a.confidence)[0];
		return best
			? (best.detectedLanguage.split("-")[0] as LanguageCode)
			: null;
	} finally {
		detector.destroy?.();
	}
}

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

export function TranslateButton({
	text,
	onTranslated,
}: {
	text: string;
	onTranslated: ({ text }: { text: string }) => void;
}) {
	const [isTranslating, setIsTranslating] = useState(false);

	const translate = async ({ target }: { target: LanguageCode }) => {
		const factory = getTranslatorFactory();
		if (!factory || !getLanguageDetectorFactory()) {
			toast.error("El traductor no está disponible en este navegador", {
				description: "Usa una versión reciente de Google Chrome en el ordenador.",
			});
			return;
		}
		if (!text.trim()) return;

		setIsTranslating(true);
		try {
			const source = await detectSourceLanguage({ text });
			if (!source) {
				toast.error("No he podido reconocer el idioma del texto", {
					description: "Solo se reconocen español, alemán e inglés.",
				});
				return;
			}
			if (source === target) {
				toast.info("El texto ya está en ese idioma");
				return;
			}

			const options = { sourceLanguage: source, targetLanguage: target };
			const availability = await factory.availability(options);
			if (availability === "unavailable") {
				toast.error("Este par de idiomas no está disponible en tu Chrome");
				return;
			}
			if (availability !== "available") {
				toast.info("Descargando el idioma la primera vez…", {
					description: "Puede tardar un poco.",
				});
			}
			const translator = await withTimeout({
				promise: factory.create(options),
				ms: TRANSLATOR_SETUP_TIMEOUT_MS,
			});
			// Translate line by line so the text keeps its line breaks.
			const lines = await Promise.all(
				text
					.split("\n")
					.map((line) => (line.trim() ? translator.translate(line) : line)),
			);
			translator.destroy?.();
			onTranslated({ text: lines.join("\n") });
		} catch (error) {
			console.error("Translation failed", error);
			toast.error("No se ha podido traducir el texto", {
				description:
					"Si es la primera vez, puede que no se haya podido descargar el idioma. Comprueba tu conexión e inténtalo de nuevo.",
			});
		} finally {
			setIsTranslating(false);
		}
	};

	return (
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
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
