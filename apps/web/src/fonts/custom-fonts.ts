/**
 * Fonts the user uploads from their own computer. They're stored in this
 * browser's IndexedDB only (never uploaded anywhere) and registered with
 * document.fonts so canvas text can use them like any other family.
 */

const DB_NAME = "opencut-custom-fonts";
const STORE_NAME = "fonts";

interface StoredFont {
	family: string;
	data: ArrayBuffer;
}

export const CUSTOM_FONT_ACCEPT = ".ttf,.otf,.woff,.woff2";

const registeredFamilies = new Set<string>();
const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;
// Stable snapshot for useSyncExternalStore; replaced only when fonts change.
let familiesSnapshot: string[] = [];

function notify(): void {
	familiesSnapshot = [...registeredFamilies].sort((a, b) => a.localeCompare(b));
	for (const listener of listeners) listener();
}

export function subscribeCustomFonts(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getCustomFontFamilies(): string[] {
	return familiesSnapshot;
}

export function isCustomFont(family: string): boolean {
	return registeredFamilies.has(family);
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE_NAME, { keyPath: "family" });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function withStore<T>({
	mode,
	run,
}: {
	mode: IDBTransactionMode;
	run: (store: IDBObjectStore) => IDBRequest<T>;
}): Promise<T> {
	const db = await openDatabase();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

async function registerFont({ family, data }: StoredFont): Promise<void> {
	const face = new FontFace(family, data);
	await face.load();
	document.fonts.add(face);
	registeredFamilies.add(family);
}

/** Registers every stored custom font. Safe to call more than once. */
export function loadCustomFonts(): Promise<void> {
	if (typeof indexedDB === "undefined") return Promise.resolve();
	if (!loadPromise) {
		loadPromise = withStore<StoredFont[]>({
			mode: "readonly",
			run: (store) => store.getAll(),
		})
			.then(async (fonts) => {
				await Promise.all(
					fonts.map((font) =>
						registerFont(font).catch((error) =>
							console.warn(`Could not load custom font ${font.family}`, error),
						),
					),
				);
				notify();
			})
			.catch((error) => console.warn("Could not read custom fonts", error));
	}
	return loadPromise;
}

function familyFromFileName({ name }: { name: string }): string {
	return name
		.replace(/\.(ttf|otf|woff2?)$/i, "")
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Validates, registers and stores a font file. Returns its family name. */
export async function addCustomFontFromFile({
	file,
}: {
	file: File;
}): Promise<string> {
	const family = familyFromFileName({ name: file.name });
	if (!family) throw new Error("Invalid font file name");
	const data = await file.arrayBuffer();
	// Loading first rejects files that aren't valid fonts before storing them.
	await registerFont({ family, data });
	await withStore({
		mode: "readwrite",
		run: (store) => store.put({ family, data } satisfies StoredFont),
	});
	notify();
	return family;
}

export async function removeCustomFont({
	family,
}: {
	family: string;
}): Promise<void> {
	await withStore({ mode: "readwrite", run: (store) => store.delete(family) });
	for (const face of document.fonts) {
		if (face.family.replace(/^"|"$/g, "") === family) document.fonts.delete(face);
	}
	registeredFamilies.delete(family);
	notify();
}
