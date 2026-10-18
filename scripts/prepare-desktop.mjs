// Builds the web app and lays out the Next.js standalone server so the
// desktop shell (apps/electron) can run it. Run from the repo root:
//   node scripts/prepare-desktop.mjs
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps", "web");
const standaloneWeb = path.join(web, ".next", "standalone", "apps", "web");

const build = spawnSync("bun", ["run", "build"], {
	cwd: web,
	stdio: "inherit",
	shell: true,
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(standaloneWeb)) {
	console.error("No se genero .next/standalone/apps/web (¿falla output: standalone?)");
	process.exit(1);
}

// Next doesn't copy static assets or public/ into the standalone folder.
rmSync(path.join(standaloneWeb, ".next", "static"), { recursive: true, force: true });
cpSync(path.join(web, ".next", "static"), path.join(standaloneWeb, ".next", "static"), {
	recursive: true,
});
if (existsSync(path.join(web, "public"))) {
	cpSync(path.join(web, "public"), path.join(standaloneWeb, "public"), { recursive: true });
}
for (const envFile of [".env.local", ".env.production", ".env"]) {
	if (existsSync(path.join(web, envFile))) {
		cpSync(path.join(web, envFile), path.join(standaloneWeb, envFile));
	}
}
// electron-builder drops a top-level node_modules when copying resources, so
// build a flat, symlink-free copy under another name; the desktop shell points
// NODE_PATH at it. Symlinks need admin rights on Windows (EPERM), so everything
// is copied as real files. A package's own dependencies (e.g. next's
// styled-jsx) sit next to it in bun's store, so each package's siblings are
// hoisted too.
const standaloneRoot = path.join(web, ".next", "standalone");
const modulesRoot = path.join(standaloneRoot, "modules_root");
rmSync(modulesRoot, { recursive: true, force: true });
mkdirSync(modulesRoot, { recursive: true });

function copyPackage({ source, name }) {
	const target = path.join(modulesRoot, name);
	if (existsSync(target)) return;
	mkdirSync(path.dirname(target), { recursive: true });
	cpSync(source, target, { recursive: true, dereference: true });
}

function hoistFolder({ folder }) {
	for (const entry of readdirSync(folder)) {
		if (entry === ".bin" || entry === ".bun") continue;
		const entryPath = path.join(folder, entry);
		if (entry.startsWith("@")) {
			for (const scoped of readdirSync(entryPath)) {
				copyPackage({ source: path.join(entryPath, scoped), name: `${entry}/${scoped}` });
			}
		} else {
			copyPackage({ source: entryPath, name: entry });
		}
	}
}

const visited = new Set();
for (const entry of readdirSync(path.join(standaloneRoot, "node_modules"))) {
	if (entry === ".bun" || entry === ".bin") continue;
	const entryPath = path.join(standaloneRoot, "node_modules", entry);
	const real = realpathSync(entryPath);
	// .../node_modules/<name> or .../node_modules/@scope/<name>
	const storeFolder = path.basename(path.dirname(real)).startsWith("@")
		? path.dirname(path.dirname(real))
		: path.dirname(real);
	if (visited.has(storeFolder)) continue;
	visited.add(storeFolder);
	hoistFolder({ folder: storeFolder });
}
console.log("Listo: servidor preparado en", standaloneWeb);
