import type { TranslationLanguage } from "./detect-language";

/**
 * Offline translation with small Opus-MT models run by transformers.js in a
 * worker. The first use of each language pair downloads its model once; after
 * that it works without internet. Pairs without a direct model go through
 * English.
 */

const DIRECT_MODELS: Record<string, string> = {
	"es-en": "Xenova/opus-mt-es-en",
	"en-es": "Xenova/opus-mt-en-es",
	"de-en": "Xenova/opus-mt-de-en",
	"en-de": "Xenova/opus-mt-en-de",
	"de-es": "Xenova/opus-mt-de-es",
	"es-de": "Xenova/opus-mt-es-de",
};

type WorkerReply =
	| { id: number; type: "progress"; percent: number }
	| { id: number; type: "done"; text: string }
	| { id: number; type: "error"; message: string };

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL("./local-translator.worker.ts", import.meta.url), {
			type: "module",
		});
	}
	return worker;
}

function runModel({
	model,
	text,
	onProgress,
}: {
	model: string;
	text: string;
	onProgress?: (percent: number) => void;
}): Promise<string> {
	const activeWorker = getWorker();
	const id = nextId++;
	return new Promise((resolve, reject) => {
		const listener = (event: MessageEvent<WorkerReply>) => {
			const reply = event.data;
			if (reply.id !== id) return;
			if (reply.type === "progress") {
				onProgress?.(reply.percent);
				return;
			}
			activeWorker.removeEventListener("message", listener);
			if (reply.type === "done") resolve(reply.text);
			else reject(new Error(reply.message));
		};
		activeWorker.addEventListener("message", listener);
		activeWorker.postMessage({ id, model, text });
	});
}

export async function translateLocally({
	text,
	source,
	target,
	onProgress,
}: {
	text: string;
	source: TranslationLanguage;
	target: TranslationLanguage;
	onProgress?: (percent: number) => void;
}): Promise<string> {
	const direct = DIRECT_MODELS[`${source}-${target}`];
	if (direct) {
		try {
			return await runModel({ model: direct, text, onProgress });
		} catch (error) {
			if (source === "en" || target === "en") throw error;
			// No direct model for this pair: go through English.
		}
	}
	const toEnglish = DIRECT_MODELS[`${source}-en`];
	const fromEnglish = DIRECT_MODELS[`en-${target}`];
	if (!toEnglish || !fromEnglish) {
		throw new Error(`No hay modelo para ${source} → ${target}`);
	}
	const english = await runModel({ model: toEnglish, text, onProgress });
	return runModel({ model: fromEnglish, text: english, onProgress });
}
