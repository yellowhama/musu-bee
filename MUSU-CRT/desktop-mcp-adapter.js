"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesktopMCPAdapter = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const mcp_1 = require("@ha/mcp");
const electron_1 = require("electron");
const config_1 = require("./config");
const constants_1 = require("./constants");
const logger_1 = require("./logger");
class DesktopMCPAdapter {
    constructor(appPath) {
        this.appPath = appPath;
        this.log = logger_1.logger;
    }
    getInstallationPath() {
        return this.appPath;
    }
    getExternalExtensionPath(_extensionId) {
        return undefined;
    }
    getAppPath() {
        return electron_1.app.getPath("appData");
    }
    getAppName() {
        return "desktop";
    }
    static getSupportedIntegrations() {
        return ["claudeCodeCLI", "codexCLI", "geminiCLI", "openCodeCLI", "kiroCLI"];
    }
    async setupIntegrations(enabledIntegrations) {
        const supportedIntegrations = DesktopMCPAdapter.getSupportedIntegrations();
        await (0, mcp_1.removeIntegrations)(this, supportedIntegrations);
        await (0, mcp_1.activateIntegrations)(this, enabledIntegrations);
    }
    async saveMCPAppInfo(content) {
        try {
            const filePath = node_path_1.default.join(constants_1.CONFIG_FOLDER, "apps", this.getAppName());
            if (!node_fs_1.default.existsSync(filePath)) {
                await node_fs_1.default.promises.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
            }
            await node_fs_1.default.promises.writeFile(filePath, content, "utf8");
            return true;
        }
        catch (err) {
            this.log.error(`failed to save MCP host info: ${err.toString()}`);
        }
        return false;
    }
    async toggleIntegration(integration, state) {
        const supportedIntegrations = DesktopMCPAdapter.getSupportedIntegrations();
        if (!supportedIntegrations.includes(integration)) {
            logger_1.logger.warn(`cannot enable unsupported integration: ${integration}`);
            return;
        }
        let enabledIntegrations = config_1.desktopConfig.get("enabledIntegrations");
        if (state) {
            if (!enabledIntegrations.includes(integration)) {
                enabledIntegrations.push(integration);
            }
        }
        else {
            enabledIntegrations = enabledIntegrations.filter((i) => i !== integration);
        }
        await this.setupIntegrations(enabledIntegrations);
        config_1.desktopConfig.set("enabledIntegrations", enabledIntegrations);
    }
}
exports.DesktopMCPAdapter = DesktopMCPAdapter;
