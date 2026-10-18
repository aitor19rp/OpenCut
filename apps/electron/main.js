// OpenCut desktop shell: starts the bundled Next.js server on localhost and
// shows it in its own window. No browser, no terminal, no internet needed.
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

// Fixed port: projects live in the browser storage (IndexedDB) of this
// origin, so the address must not change between launches.
const PORT = Number(process.env.OPENCUT_PORT) || 38211;
const HOST = "127.0.0.1";
const START_URL = `http://${HOST}:${PORT}/projects`;

let serverProcess = null;
let serverLogPath = null;
let mainWindow = null;

function getServerEntry() {
	const candidates = [
		path.join(process.resourcesPath ?? "", "server", "apps", "web", "server.js"),
		path.join(__dirname, "..", "web", ".next", "standalone", "apps", "web", "server.js"),
	];
	return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function isPortFree() {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.once("error", () => resolve(false));
		probe.once("listening", () => probe.close(() => resolve(true)));
		probe.listen(PORT, HOST);
	});
}

function waitForServer({ timeoutMs }) {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const attempt = () => {
			const request = http.get(START_URL, (response) => {
				response.resume();
				resolve();
			});
			request.on("error", () => {
				if (Date.now() > deadline) reject(new Error("El servidor no arranco"));
				else setTimeout(attempt, 300);
			});
		};
		attempt();
	});
}

function startServer({ entry }) {
	serverLogPath = path.join(app.getPath("userData"), "servidor.log");
	fs.mkdirSync(path.dirname(serverLogPath), { recursive: true });
	const logFd = fs.openSync(serverLogPath, "w");
	fs.writeSync(logFd, `entry=${entry}\nexec=${process.execPath}\n`);
	const rootModules = path.join(entry, "..", "..", "..", "modules_root");
	const nodePath = fs.existsSync(rootModules)
		? [rootModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
		: process.env.NODE_PATH;
	serverProcess = spawn(process.execPath, [entry], {
		cwd: path.dirname(entry),
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			...(nodePath ? { NODE_PATH: nodePath } : {}),
			NODE_ENV: "production",
			PORT: String(PORT),
			HOSTNAME: HOST,
		},
		stdio: ["ignore", logFd, logFd],
		windowsHide: true,
	});
	serverProcess.on("error", (error) => {
		fs.writeSync(logFd, `spawn error: ${error.message}\n`);
	});
	serverProcess.on("exit", (code, signal) => {
		fs.writeSync(logFd, `server exit code=${code} signal=${signal}\n`);
		serverProcess = null;
	});
}

function stopServer() {
	if (serverProcess) {
		serverProcess.kill();
		serverProcess = null;
	}
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
		minWidth: 1000,
		minHeight: 640,
		title: "OpenCut",
		backgroundColor: "#0b0b0b",
		autoHideMenuBar: true,
		webPreferences: { contextIsolation: true, sandbox: true },
	});
	Menu.setApplicationMenu(null);
	mainWindow.loadURL(START_URL);
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith(`http://${HOST}:${PORT}`)) {
			return {
				action: "allow",
				overrideBrowserWindowOptions: { autoHideMenuBar: true },
			};
		}
		shell.openExternal(url);
		return { action: "deny" };
	});
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});

	app.whenReady().then(async () => {
		const entry = getServerEntry();
		if (!entry) {
			dialog.showErrorBox(
				"OpenCut",
				"No se encuentra el servidor. Ejecuta primero OpenCut-crear-exe.bat (o 'bun run desktop:build').",
			);
			app.quit();
			return;
		}
		if (!(await isPortFree())) {
			dialog.showErrorBox(
				"OpenCut",
				`El puerto ${PORT} esta ocupado. Cierra la otra copia de OpenCut e intentalo de nuevo.`,
			);
			app.quit();
			return;
		}
		startServer({ entry });
		try {
			await waitForServer({ timeoutMs: 60000 });
		} catch (error) {
			let details = "";
			try {
				details = fs.readFileSync(serverLogPath, "utf8").slice(-1500);
			} catch {}
			dialog.showErrorBox(
				"OpenCut",
				`${String(error.message ?? error)}\n\nRegistro (${serverLogPath}):\n${details}`,
			);
			stopServer();
			app.quit();
			return;
		}
		createWindow();
	});

	app.on("window-all-closed", () => app.quit());
	app.on("before-quit", stopServer);
	process.on("exit", stopServer);
}
