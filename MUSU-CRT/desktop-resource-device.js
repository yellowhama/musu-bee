"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesktopResourceDevice = void 0;
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const electron_1 = __importStar(require("electron"));
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const claude_1 = require("./claude");
const codex_1 = require("./codex");
const config_1 = require("./config");
const constants_1 = require("./constants");
const logger_1 = require("./logger");
const licenseFilePath = path.join(constants_1.CONFIG_FOLDER, `license-token${constants_1.IS_DEV ? "-dev" : ""}.json`);
class DesktopResourceDevice extends eventemitter3_1.default {
    constructor(filePath, fileContent, onSave) {
        super();
        this.isDirty = false;
        this.ignoreDirtyOnClose = false;
        this.initialized = false;
        this.id = crypto.randomUUID();
        this.filePath = filePath;
        this.fileContent = fileContent;
        this.onSave = onSave;
        const windowBounds = config_1.desktopConfig.get("windowBounds");
        const newWindow = new electron_1.BrowserWindow({
            width: windowBounds.width,
            height: windowBounds.height,
            x: windowBounds.x,
            y: windowBounds.y,
            // show: !args?.headless,
            titleBarStyle: "hiddenInset",
            frame: process.platform !== "darwin",
            backgroundColor: "#1e1e1e",
            trafficLightPosition: { x: 12, y: 12 },
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, "preload.js"),
            },
        });
        newWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                electron_1.shell.openExternal(url);
                return { action: "deny" };
            }
            return { action: "allow" };
        });
        newWindow.on("close", async (event) => {
            var _a;
            const isLoggedIn = Boolean((_a = this.getLicense()) === null || _a === void 0 ? void 0 : _a.licenseToken);
            if (!this.ignoreDirtyOnClose && isLoggedIn && this.getIsDirty()) {
                event.preventDefault();
                const cancelled = await this.saveResource({
                    userAction: false,
                });
                if (cancelled) {
                    return;
                }
                this.ignoreDirtyOnClose = true;
                if (!(newWindow === null || newWindow === void 0 ? void 0 : newWindow.isDestroyed())) {
                    newWindow === null || newWindow === void 0 ? void 0 : newWindow.close();
                }
                return;
            }
            this.ignoreDirtyOnClose = false;
        });
        newWindow.on("resized", () => {
            if (newWindow === null || newWindow === void 0 ? void 0 : newWindow.isDestroyed()) {
                return;
            }
            const bounds = newWindow === null || newWindow === void 0 ? void 0 : newWindow.getBounds();
            if (!bounds) {
                return;
            }
            config_1.desktopConfig.set("windowBounds", bounds);
        });
        newWindow.on("closed", async () => {
            this.emit("window-closed");
        });
        newWindow.on("focus", () => {
            this.emit("window-focused");
        });
        newWindow.on("enter-full-screen", () => {
            this.emit("window-fullscreen-changed", true);
        });
        newWindow.on("leave-full-screen", () => {
            this.emit("window-fullscreen-changed", false);
        });
        if (!newWindow.isDestroyed() && !newWindow.webContents.isDestroyed()) {
            newWindow.webContents.on("did-finish-load", async () => {
                // We dont handle reloads on the initial load.
                if (!this.initialized) {
                    this.initialized = true;
                }
                this.emit("window-load-finished", this.initialized);
            });
        }
        this.window = newWindow;
    }
    getWindow() {
        return this.window;
    }
    focusWindow() {
        if (this.window.isDestroyed()) {
            return;
        }
        if (this.window.isMinimized()) {
            this.window.restore();
        }
        this.window.focus();
    }
    getResourcePath() {
        return this.filePath;
    }
    getResourceContents() {
        return this.fileContent;
    }
    getDeviceId() {
        const machineId = os.hostname() + os.platform() + os.arch();
        return crypto.createHash("md5").update(machineId).digest("hex");
    }
    getIsDirty() {
        return this.isDirty;
    }
    getLicense() {
        try {
            const license = require(licenseFilePath);
            // Only return if both fields are present
            if ((license === null || license === void 0 ? void 0 : license.email) && (license === null || license === void 0 ? void 0 : license.licenseToken)) {
                return { email: license.email, licenseToken: license.licenseToken };
            }
            return undefined;
        }
        catch (_a) {
            return undefined;
        }
    }
    setLicense(email, licenseToken) {
        try {
            // Ensure directory exists synchronously for simplicity
            try {
                fs.mkdirSync(constants_1.CONFIG_FOLDER, { recursive: true });
            }
            catch (_a) { }
            fs.writeFileSync(licenseFilePath, JSON.stringify({ email, licenseToken }, null, 2));
        }
        catch (error) {
            console.error("Failed to save license:", error);
        }
    }
    async readFile(filePath) {
        const data = await fs.promises.readFile(path.isAbsolute(filePath)
            ? filePath
            : path.join(await this.getResourceFolderPath(), filePath));
        return new Uint8Array(data);
    }
    async ensureDir(dirPath) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    async writeFile(filePath, contents) {
        fs.writeFileSync(filePath, contents);
    }
    async saveResource(params) {
        let shouldSave = true;
        if (this.isDirty && !params.userAction) {
            const response = await electron_1.default.dialog.showMessageBox(this.window, {
                type: "warning",
                message: `Do you want to save the changes you made to ${this.getResourcePath()}?`,
                buttons: ["Save", "Don't Save", "Cancel"],
                detail: "Your changes will be lost if you don't save them.",
            });
            // User selected "Don't Save"
            if (response.response === 1) {
                shouldSave = false;
            }
            // User selected "Cancel"
            if (response.response === 2) {
                return true;
            }
        }
        if (!shouldSave) {
            return false;
        }
        let filePathToSave;
        if (!this.isTemporary() && !params.saveAs) {
            filePathToSave = this.getResourcePath();
        }
        else if (!this.isTemporary()) {
            const response = await electron_1.default.dialog.showSaveDialog(this.window, {
                title: "Save .pen file as…",
                filters: [
                    { name: "Pencil Design Files", extensions: ["pen"] },
                    { name: "All Files", extensions: ["*"] },
                ],
                defaultPath: this.getResourcePath(),
            });
            if (response.canceled) {
                return true;
            }
            filePathToSave = response.filePath;
        }
        else {
            const response = await electron_1.default.dialog.showSaveDialog(this.window, {
                title: "Save new .pen file",
                defaultPath: "untitled.pen",
            });
            if (response.canceled) {
                return true;
            }
            const srcImages = path.join(await this.getResourceFolderPath(), "images");
            if (fs.existsSync(srcImages)) {
                const dstImages = path.join(path.dirname(response.filePath), "images");
                fs.cpSync(srcImages, dstImages, { recursive: true });
                fs.rmSync(srcImages, { recursive: true, force: true });
            }
            filePathToSave = response.filePath;
        }
        try {
            this.fileContent = await this.onSave(filePathToSave);
        }
        catch (e) {
            logger_1.logger.error(`Failed to save ${filePathToSave}`, e);
            return false;
        }
        fs.writeFileSync(filePathToSave, this.fileContent, "utf8");
        if (this.isTemporary()) {
            this.emit("load-file", {
                filePath: filePathToSave,
                zoomToFit: false,
                closeCurrent: true,
            });
        }
        if (this.isDirty) {
            this.emit("dirty-changed", false);
            this.isDirty = false;
        }
        return false;
    }
    fileChanged() {
        if (!this.isDirty) {
            this.emit("dirty-changed", true);
            this.isDirty = true;
        }
    }
    async importFileByName(fileName, fileContents) {
        const baseDirectory = await this.getResourceFolderPath();
        let imagesDirectory = baseDirectory;
        if (this.isTemporary()) {
            imagesDirectory = path.join(imagesDirectory, "images");
            await fs.promises.mkdir(imagesDirectory, { recursive: true });
        }
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        const buffer = Buffer.from(fileContents);
        let candidate = path.join(imagesDirectory, `${base}${ext}`);
        let counter = 0;
        // NOTE(sedivy): Loop to find a non-colliding destination file name we
        // can use to store the imported file.
        for (;;) {
            // NOTE(sedivy): Try to claim the file name. If we fail to do an exclusive
            // create, it means the file name is taken.
            try {
                await fs.promises.writeFile(candidate, buffer, { flag: "wx" });
                return { filePath: path.relative(baseDirectory, candidate) };
            }
            catch (e) {
                if (e.code !== "EEXIST") {
                    throw e;
                }
            }
            // NOTE(sedivy): File name is taken, see if the existing file is
            // identical to what we want to import.
            try {
                const existing = await fs.promises.readFile(candidate);
                if (existing.equals(buffer)) {
                    return { filePath: path.relative(baseDirectory, candidate) };
                }
            }
            catch (e) {
                if (e.code === "ENOENT" || e.code === "EISDIR") {
                    continue;
                }
                throw e;
            }
            // NOTE(sedivy): File name is taken with a different content, try next candidate.
            counter++;
            candidate = path.join(imagesDirectory, `${base}-${counter}${ext}`);
        }
    }
    async importFileByUri(fileUriString) {
        // Simple implementation - copy file to pen directory
        const sourceFile = fileUriString.replace("file://", "");
        const fileName = path.basename(sourceFile);
        const fileContents = fs.readFileSync(sourceFile);
        const result = await this.importFileByName(fileName, fileContents.buffer);
        return {
            filePath: result.filePath,
            fileContents: fileContents.buffer,
        };
    }
    async openDocument(type) {
        logger_1.logger.info("openDocument", type);
        const filePath = type.endsWith(".pen") ? type : `pencil-${type}.pen`;
        this.emit("load-file", { filePath, zoomToFit: true });
    }
    getActiveThemeKind() {
        return electron_1.default.nativeTheme.shouldUseDarkColors ? "dark" : "light";
    }
    async submitPrompt(prompt, modelID, _selectedIDs, files) {
        logger_1.logger.info("submitPrompt", prompt, modelID);
        this.emit("prompt-agent", prompt, modelID, files);
    }
    async loadURL(fileToLoad) {
        logger_1.logger.info("[DesktopResourceDevice] loadURL() | fileToLoad:", fileToLoad);
        if (constants_1.IS_DEV) {
            return this.window.webContents.loadURL(`http://localhost:${constants_1.EDITOR_PORT}/#/editor/${fileToLoad}`);
        }
        else {
            return this.window.webContents.loadURL(`${constants_1.APP_PROTOCOL}://editor/#/editor/${fileToLoad}`);
        }
    }
    toggleDesignMode() {
        logger_1.logger.info("toggleDesignMode not implemented for desktop");
    }
    setLeftSidebarVisible(visible) {
        logger_1.logger.info("setLeftSidebarVisible not implemented for desktop", visible);
    }
    signOut() {
        if (fs.existsSync(licenseFilePath)) {
            fs.unlinkSync(licenseFilePath);
        }
    }
    getAgentPackagePath(type) {
        return type === "codex"
            ? (0, codex_1.getCodexPackagePath)()
            : (0, claude_1.getClaudeCodePackagePath)();
    }
    getAgentApiKey(type) {
        return type === "codex"
            ? config_1.desktopConfig.get("codexApiKey")
            : config_1.desktopConfig.get("claudeApiKey");
    }
    execPath() {
        return (0, claude_1.getClaudeExecPath)();
    }
    getAgentEnv() {
        return (0, claude_1.getClaudeCodeEnv)();
    }
    agentIncludePartialMessages() {
        return true;
    }
    isTemporary() {
        const resource = this.getResourcePath();
        return !path.isAbsolute(resource) && resource.startsWith("pencil-");
    }
    async getResourceFolderPath() {
        if (!this.isTemporary()) {
            return path.dirname(this.getResourcePath());
        }
        const resourcePath = path.join(constants_1.CONFIG_FOLDER, "resources", this.id);
        fs.mkdirSync(resourcePath, { recursive: true });
        return resourcePath;
    }
    async dispose() {
        this.removeAllListeners();
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
        if (!this.isTemporary()) {
            return;
        }
        const dir = await this.getResourceFolderPath();
        if (fs.existsSync(dir)) {
            await fs.promises.rm(dir, { recursive: true, force: true });
        }
    }
}
exports.DesktopResourceDevice = DesktopResourceDevice;
