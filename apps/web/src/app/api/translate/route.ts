import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Forwards a translation request to DeepL. The browser can't call DeepL
 * directly (no CORS), so it goes through this local route. The API key is sent
 * by the app on every request and is never stored on the server.
 */
const bodySchema = z.object({
	text: z.string().min(1).max(5000),
	target: z.enum(["es", "de", "en"]),
	apiKey: z.string().min(10).max(100),
});

const DEEPL_TARGETS = { es: "ES", de: "DE", en: "EN-US" } as const;

export async function POST(request: NextRequest) {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_request" }, { status: 400 });
	}
	const { text, target, apiKey } = parsed.data;

	// Free-plan keys end in ":fx" and use a different host. If DeepL rejects
	// the key on the guessed host, try the other one before giving up.
	const hosts = apiKey.endsWith(":fx")
		? ["https://api-free.deepl.com", "https://api.deepl.com"]
		: ["https://api.deepl.com", "https://api-free.deepl.com"];

	const requestInit: RequestInit = {
		method: "POST",
		headers: {
			Authorization: `DeepL-Auth-Key ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			text: [text],
			target_lang: DEEPL_TARGETS[target],
			preserve_formatting: true,
		}),
		signal: AbortSignal.timeout(20_000),
	};

	let response: Response | null = null;
	for (const host of hosts) {
		try {
			response = await fetch(`${host}/v2/translate`, requestInit);
		} catch {
			return NextResponse.json({ error: "network" }, { status: 502 });
		}
		if (response.status !== 403) break;
	}
	if (!response) {
		return NextResponse.json({ error: "network" }, { status: 502 });
	}

	if (!response.ok) {
		const error =
			response.status === 403
				? "invalid_key"
				: response.status === 456
					? "quota_exceeded"
					: response.status === 429
						? "rate_limited"
						: "deepl_error";
		return NextResponse.json({ error }, { status: response.status });
	}

	const data = (await response.json()) as {
		translations?: Array<{ text: string; detected_source_language: string }>;
	};
	const translation = data.translations?.[0];
	if (!translation) {
		return NextResponse.json({ error: "deepl_error" }, { status: 502 });
	}
	return NextResponse.json({
		text: translation.text,
		detectedSourceLanguage: translation.detected_source_language.toLowerCase(),
	});
}
