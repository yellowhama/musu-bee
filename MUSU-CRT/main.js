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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const Sentry = __importStar(require("@sentry/electron/main"));
const electron_1 = require("electron");
const agent_execute_config_1 = require("./agent-execute-config");
const app_1 = require("./app");
const constants_1 = require("./constants");
const logger_1 = require("./logger");
Sentry.init({
    dsn: "https://1f085c3019b029471bf9e444f4734eb5@o4510271844122624.ingest.us.sentry.io/4510753382400000",
    // Include the package version as the release version
    release: electron_1.app.getVersion(),
    // Intentionally sending PIIs like IP addresses, user IDs for now.
    sendDefaultPii: true,
    // Disable Sentry in development environment
    enabled: !constants_1.IS_DEV,
    beforeSend(event) {
        if (!event.contexts) {
            event.contexts = {};
        }
        if (!event.contexts.device) {
            event.contexts.device = {};
        }
        event.contexts.device["Is Online"] = electron_1.net.isOnline();
        return event;
    },
});
let initArgs = getInitArgs();
let pencilApp;
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on("second-instance", (_event, commandLine, _workingDirectory) => {
        // Someone tried to run another instance, focus our window instead
        const focusedWindow = pencilApp === null || pencilApp === void 0 ? void 0 : pencilApp.getFocusedWindow();
        if (focusedWindow) {
            if (focusedWindow.isMinimized())
                focusedWindow.restore();
            focusedWindow.focus();
        }
        const args = commandLine.slice(electron_1.app.isPackaged ? 1 : 2);
        const fileArg = args.find((arg) => arg.endsWith(".pen"));
        if (fileArg && pencilApp) {
            const resolvedPath = resolveFilePath(fileArg);
            if (fs.existsSync(resolvedPath)) {
                pencilApp.loadFile(resolvedPath, true);
            }
        }
    });
}
// Register custom protocol for serving editor files
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme: constants_1.APP_PROTOCOL,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);
electron_1.app.whenReady().then(async () => {
    logger_1.logger.info(`App ready. IS_DEV: ${constants_1.IS_DEV}, NODE_ENV: ${process.env.NODE_ENV}`);
    if (!constants_1.IS_DEV) {
        // Register protocol handler for production editor files
        electron_1.protocol.handle(constants_1.APP_PROTOCOL, (request) => {
            try {
                const url = new URL(request.url);
                const filePath = url.pathname;
                let targetFile;
                if (filePath === "/" || filePath === "/editor" || filePath === "") {
                    targetFile = path.join(__dirname, "editor", "index.html");
                }
                else {
                    const cleanPath = filePath.startsWith("/")
                        ? filePath.slice(1)
                        : filePath;
                    targetFile = path.join(__dirname, "editor", cleanPath);
                }
                return electron_1.net.fetch(`file://${targetFile}`);
            }
            catch (error) {
                logger_1.logger.error("Protocol handler error:", error);
                throw error;
            }
        });
    }
    else {
        logger_1.logger.debug("Skipping protocol handler registration (dev mode)");
    }
    pencilApp = new app_1.PencilApp();
    await pencilApp.initialize(initArgs);
});
electron_1.app.on("window-all-closed", async () => {
    if (pencilApp) {
        await pencilApp.cleanup();
    }
    electron_1.app.quit();
});
electron_1.app.on("open-file", async (event, filePath) => {
    logger_1.logger.info("open-file", event, filePath);
    event.preventDefault();
    if (path.extname(filePath) !== ".pen") {
        return;
    }
    if (pencilApp) {
        // App is already running, open the file directly
        pencilApp.loadFile(filePath, true);
    }
    else {
        // App is starting, store the file to open after initialization
        initArgs = { filePath };
    }
});
function resolveFilePath(filePath) {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    return path.resolve(process.cwd(), filePath);
}
function getInitArgs() {
    const argIndex = electron_1.app.isPackaged ? 1 : 2;
    const args = process.argv.slice(argIndex);
    if (args.length === 0) {
        return undefined;
    }
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--agent-config") {
            const configString = args[i + 1];
            if (configString) {
                const config = (0, agent_execute_config_1.parseAgentExecuteConfig)(configString);
                if (config) {
                    result.agentExecuteConfig = config;
                }
            }
            i++;
        }
        else if (arg === "--file" && i + 1 < args.length) {
            const filePath = args[i + 1];
            const resolvedPath = resolveFilePath(filePath);
            if (fs.existsSync(resolvedPath) &&
                path.extname(resolvedPath) === ".pen") {
                result.filePath = resolvedPath;
            }
            else {
                logger_1.logger.error(`Error: File not found or invalid: ${filePath}`);
                electron_1.app.quit();
                return undefined;
            }
            i++;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
