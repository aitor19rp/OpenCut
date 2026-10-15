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

function getTranslatorFactory(): TranslatorFactory | null {
	if (typeof window === "undefined") return null;
	return (
		(window as Window & { Translator?: TranslatorFactory }).Translator ?? null
	);
}

const TRANSLATION_PAIRS = [
	{ source: "es", target: "de", label: "Español → Alemán" },
	{ source: "de", target: "es", label: "Alemán → Español" },
	{ source: "en", target: "es", label: "Inglés (EE. UU.) → Español" },
	{ source: "es", target: "en", label: "Español → Inglés (EE. UU.)" },
] as const;

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

	const translate = async ({
		source,
		target,
	}: {
		source: string;
		target: string;
	}) => {
		const factory = getTranslatorFactory();
		if (!factory) {
			toast.error("El traductor no está disponible en este navegador", {
				description: "Usa una versión reciente de Google Chrome en el ordenador.",
			});
			return;
		}
		if (!text.trim()) return;

		setIsTranslating(true);
		try {
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
				{TRANSLATION_PAIRS.map((pair) => (
					<DropdownMenuItem
						key={`${pair.source}-${pair.target}`}
						onClick={() => translate(pair)}
					>
						{pair.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
