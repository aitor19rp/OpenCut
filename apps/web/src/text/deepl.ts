import type { TranslationLanguage } from "./detect-language";

const API_KEY_STORAGE_KEY = "opencut-deepl-api-key";

export type DeepLErrorCode =
	| "invalid_key"
	| "quota_exceeded"
	| "rate_limited"
	| "network"
	| "deepl_error";

export class DeepLError extends Error {
	constructor(readonly code: DeepLErrorCode) {
		super(code);
	}
}

export function getDeepLApiKey(): string | null {
	try {
		return localStorage.getItem(API_KEY_STORAGE_KEY);
	} catch {
		return null;
	}
}

export function setDeepLApiKey({ apiKey }: { apiKey: string | null }): void {
	try {
		if (apiKey) localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
		else localStorage.removeItem(API_KEY_STORAGE_KEY);
	} catch {
		// Storage unavailable: the key just won't be remembered.
	}
}

export function describeDeepLError({ code }: { code: DeepLErrorCode }): string {
	switch (code) {
		case "invalid_key":
			return "La clave de DeepL no es válida. Revísala en 'Configurar DeepL'.";
		case "quota_exceeded":
			return "Has agotado los caracteres de DeepL de este mes.";
		case "rate_limited":
			return "DeepL pide ir más despacio. Inténtalo de nuevo en unos segundos.";
		case "network":
			return "No hay conexión con DeepL (¿sin internet?).";
		default:
			return "DeepL ha devuelto un error.";
	}
}

/** Translates through the app's local /api/translate route. */
export async function translateWithDeepL({
	text,
	target,
	apiKey,
}: {
	text: string;
	target: TranslationLanguage;
	apiKey: string;
}): Promise<{ text: string; detectedSourceLanguage: string }> {
	let response: Response;
	try {
		response = await fetch("/api/translate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text, target, apiKey }),
		});
	} catch {
		throw new DeepLError("network");
	}
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: DeepLErrorCode;
		} | null;
		throw new DeepLError(body?.error ?? "deepl_error");
	}
	return (await response.json()) as { text: string; detectedSourceLanguage: string };
}
