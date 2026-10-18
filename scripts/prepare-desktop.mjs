// Builds the web app and lays out the Next.js standalone server so the
// desktop shell (apps/electron) can run it. Run from the repo root:
//   node scripts/prepare-desktop.mjs
import { cpSync, existsSync, rmSync } from "node:fs";
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
// keep a copy under another name; the desktop shell points NODE_PATH at it.
const standaloneRoot = path.join(web, ".next", "standalone");
rmSync(path.join(standaloneRoot, "modules_root"), { recursive: true, force: true });
// dereference: bun's node_modules is full of symlinks, and creating symlinks
// on Windows needs admin rights (EPERM), so copy the real files instead.
cpSync(path.join(standaloneRoot, "node_modules"), path.join(standaloneRoot, "modules_root"), {
	recursive: true,
	dereference: true,
});
console.log("Listo: servidor preparado en", standaloneWeb);
