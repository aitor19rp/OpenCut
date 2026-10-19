export type TranslationLanguage = "es" | "de" | "en";

const STOPWORDS: Record<TranslationLanguage, string[]> = {
	es: [
		"el", "la", "los", "las", "un", "una", "de", "del", "que", "y", "en", "es",
		"por", "con", "para", "no", "si", "sí", "se", "lo", "al", "su", "como",
		"más", "pero", "muy", "esto", "esta", "este", "te", "me", "mi", "tu",
		"qué", "cómo", "cuando", "donde", "hay", "soy", "eres", "estoy", "quieres",
		"comenta", "gracias", "hola", "ya", "tengo", "tiene", "nos", "les",
	],
	de: [
		"der", "die", "das", "und", "ist", "nicht", "ich", "du", "sie", "es", "ein",
		"eine", "zu", "mit", "auf", "für", "den", "dem", "von", "wenn", "wie", "was",
		"auch", "aber", "wir", "ihr", "mir", "dir", "bei", "nach", "noch", "nur",
		"hallo", "danke", "bitte", "kommentiere", "willst", "habe", "hast", "sind",
		"wird", "oder", "dass", "doch", "schon", "jetzt", "mehr",
	],
	en: [
		"the", "and", "is", "are", "you", "to", "of", "in", "it", "that", "for",
		"with", "this", "not", "be", "have", "do", "if", "your", "we", "they",
		"what", "how", "when", "but", "on", "at", "my", "me", "can", "will", "want",
		"hello", "thanks", "please", "comment", "just", "like", "so", "get", "all",
		"text", "default", "title", "name", "new", "free", "now", "best", "love",
		"from", "or", "an", "as", "was", "were", "has", "had",
	],
};

/** Characters that only occur in one of the three languages. */
const SPECIAL_CHARS: Array<{ language: TranslationLanguage; pattern: RegExp; weight: number }> = [
	{ language: "es", pattern: /[ñ¿¡]/g, weight: 3 },
	{ language: "es", pattern: /[áéíóú]/g, weight: 0.5 },
	{ language: "de", pattern: /[äöüß]/g, weight: 2 },
];

/**
 * Guesses whether a text is Spanish, German or English from common words and
 * characters. Good enough for short captions; returns null when unsure.
 */
export function detectLanguage({
	text,
}: {
	text: string;
}): TranslationLanguage | null {
	const words = text
		.toLowerCase()
		.split(/[^\p{L}]+/u)
		.filter(Boolean);
	if (words.length === 0) return null;

	const scores: Record<TranslationLanguage, number> = { es: 0, de: 0, en: 0 };
	for (const language of Object.keys(STOPWORDS) as TranslationLanguage[]) {
		const stopwords = new Set(STOPWORDS[language]);
		for (const word of words) {
			if (stopwords.has(word)) scores[language] += 1;
		}
	}
	for (const { language, pattern, weight } of SPECIAL_CHARS) {
		const matches = text.toLowerCase().match(pattern);
		if (matches) scores[language] += matches.length * weight;
	}

	const ranked = (Object.entries(scores) as Array<[TranslationLanguage, number]>).sort(
		(a, b) => b[1] - a[1],
	);
	const [best, second] = ranked;
	if (best[1] === 0 || best[1] === second[1]) return null;
	return best[0];
}
