/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers";

// The ONNX runtime files are served by the app itself (public/ort), so nothing
// but the model weights ever needs the internet, and those are cached after
// the first download.
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.allowRemoteModels = true;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
	env.backends.onnx.wasm.wasmPaths = {
		mjs: "/ort/ort-wasm-simd-threaded.mjs",
		wasm: "/ort/ort-wasm-simd-threaded.wasm",
	};
	env.backends.onnx.wasm.numThreads = 1;
}

type Translate = (
	text: string,
	options: { max_new_tokens: number; num_beams: number },
) => Promise<Array<{ translation_text: string }>>;

const translators = new Map<string, Promise<Translate>>();

function getTranslator({
	model,
	onProgress,
}: {
	model: string;
	onProgress: (percent: number) => void;
}): Promise<Translate> {
	let translator = translators.get(model);
	if (!translator) {
		translator = (
			pipeline("translation", model, {
				dtype: "q8",
				device: "wasm",
				progress_callback: (info: { status?: string; progress?: number }) => {
					if (info.status === "progress" && typeof info.progress === "number") {
						onProgress(info.progress);
					}
				},
			}) as unknown as Promise<Translate>
		).catch((error) => {
			translators.delete(model);
			throw error;
		});
		translators.set(model, translator);
	}
	return translator;
}

self.onmessage = async (event: MessageEvent<{ id: number; model: string; text: string }>) => {
	const { id, model, text } = event.data;
	try {
		const translate = await getTranslator({
			model,
			onProgress: (percent) => self.postMessage({ id, type: "progress", percent }),
		});
		const output = await translate(text, { max_new_tokens: 400, num_beams: 4 });
		self.postMessage({ id, type: "done", text: output[0]?.translation_text ?? "" });
	} catch (error) {
		self.postMessage({
			id,
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
