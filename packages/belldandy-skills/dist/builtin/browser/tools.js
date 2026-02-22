import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs/promises";
import WebSocket from "ws";
// Relay Server runs on port 28892 by default
const RELAY_WS_ENDPOINT = "ws://127.0.0.1:28892/cdp";
import { SNAPSHOT_SCRIPT } from "./snapshot.js";
// Global logger instance (set by BrowserManager)
let browserLogger;
export function setBrowserLogger(logger) {
    browserLogger = logger;
}
// =========================================
// Direct CDP Helper - 绕过 Puppeteer 的 session 管理
// =========================================
async function sendCdpCommand(method, params = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(RELAY_WS_ENDPOINT);
        const timeoutId = setTimeout(() => {
            ws.close();
            reject(new Error(`CDP command ${method} timed out after ${timeout}ms`));
        }, timeout);
        const id = Date.now();
        ws.on("open", () => {
            ws.send(JSON.stringify({ id, method, params }));
        });
        ws.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) {
                    clearTimeout(timeoutId);
                    ws.close();
                    if (msg.error) {
                        reject(new Error(msg.error.message || msg.error));
                    }
                    else {
                        resolve(msg.result);
                    }
                }
            }
            catch (err) {
                // Ignore parse errors for events
            }
        });
        ws.on("error", (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
        ws.on("close", () => {
            clearTimeout(timeoutId);
        });
    });
}
// [SECURITY] 域名控制（双模式）
const ALLOWED_DOMAINS_RAW = process.env.BELLDANDY_BROWSER_ALLOWED_DOMAINS;
const DENIED_DOMAINS_RAW = process.env.BELLDANDY_BROWSER_DENIED_DOMAINS;
const ALLOWED_DOMAINS = ALLOWED_DOMAINS_RAW?.split(",").map(d => d.trim().toLowerCase()).filter(Boolean) || [];
const DENIED_DOMAINS = DENIED_DOMAINS_RAW?.split(",").map(d => d.trim().toLowerCase()).filter(Boolean) || [];
function validateBrowserUrl(urlStr) {
    let url;
    try {
        url = new URL(urlStr);
    }
    catch {
        return { ok: false, error: `无效的 URL: ${urlStr}` };
    }
    const hostname = url.hostname.toLowerCase();
    // 黑名单检查（优先级最高）
    if (DENIED_DOMAINS.length > 0) {
        const denied = DENIED_DOMAINS.find(d => hostname === d || hostname.endsWith(`.${d}`));
        if (denied) {
            return { ok: false, error: `域名被禁止: ${hostname}` };
        }
    }
    // 白名单检查（仅在配置了白名单时生效）
    if (ALLOWED_DOMAINS.length > 0) {
        const allowed = ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
        if (!allowed) {
            return { ok: false, error: `域名不在白名单中: ${hostname}` };
        }
    }
    return { ok: true };
}
class BrowserManager {
    static instance;
    browser = null;
    connecting = false;
    constructor() { }
    static getInstance() {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }
    async connect() {
        if (this.browser && this.browser.isConnected()) {
            return this.browser;
        }
        if (this.connecting) {
            // Wait for existing connection attempt
            while (this.connecting) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (this.browser && this.browser.isConnected()) {
                return this.browser;
            }
        }
        this.connecting = true;
        try {
            // Connect to Belldandy Relay
            this.browser = await puppeteer.connect({
                browserWSEndpoint: RELAY_WS_ENDPOINT,
                defaultViewport: null, // Let browser handle viewport
            });
            browserLogger?.debug("Connected to relay");
            this.browser.on("disconnected", () => {
                browserLogger?.warn("Browser disconnected");
                this.browser = null;
            });
            return this.browser;
        }
        finally {
            this.connecting = false;
        }
    }
    async getPage() {
        const browser = await this.connect();
        let pages = await browser.pages();
        // Puppeteer via Relay should find the targets exposed by Relay.
        // If we have open pages, pick the first visible one (usually the active tab user is on).
        if (pages.length > 0) {
            return pages[0];
        }
        browserLogger?.debug("Waiting for targets...");
        try {
            const target = await browser.waitForTarget(t => t.type() === 'page', { timeout: 5000 });
            const page = await target.page();
            if (!page)
                throw new Error("Target found but no page attached");
            return page;
        }
        catch (err) {
            const targets = browser.targets();
            const targetDebug = targets.map(t => ({
                type: t.type(),
                url: t.url(),
                isPage: t.type() === 'page'
            }));
            browserLogger?.warn("No pages found after wait", { targets: targetDebug });
            throw new Error("No pages found. Ensure the Browser Extension is connected to the Relay.");
        }
    }
    async close() {
        if (this.browser) {
            await this.browser.disconnect();
            this.browser = null;
        }
    }
}
// Helper to standardise tool results
const success = (id, name, output, start) => ({
    id,
    name,
    success: true,
    output,
    durationMs: Date.now() - start,
});
const failure = (id, name, error, start) => ({
    id,
    name,
    success: false,
    output: "",
    error: error instanceof Error ? error.message : String(error),
    durationMs: Date.now() - start,
});
// --- Tools ---
export const browserOpenTool = {
    definition: {
        name: "browser_open",
        description: "Open a NEW browser tab and navigate to a URL. Use this to start a browsing session without affecting the current page.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The URL to navigate to." },
            },
            required: ["url"],
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const url = args.url;
            // [SECURITY] 域名校验
            const validation = validateBrowserUrl(url);
            if (!validation.ok) {
                return failure("unknown", "browser_open", validation.error, start);
            }
            browserLogger?.debug(`Creating new tab for URL: ${url}`);
            // 使用直接 CDP 命令创建标签页（绕过 Puppeteer 的 session 管理）
            // 扩展的 Target.createTarget 会直接创建带 URL 的标签页
            const result = await sendCdpCommand("Target.createTarget", { url });
            browserLogger?.debug(`Successfully created tab with targetId: ${result.targetId}`);
            return success("unknown", "browser_open", `成功打开新标签页: ${url}`, start);
        }
        catch (err) {
            browserLogger?.error("browser_open failed", err);
            return failure("unknown", "browser_open", err, start);
        }
    },
};
export const browserNavigateTool = {
    definition: {
        name: "browser_navigate",
        description: "Navigate the active tab to a new URL.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The URL to navigate to." },
            },
            required: ["url"],
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const url = args.url;
            // [SECURITY] 域名校验
            const validation = validateBrowserUrl(url);
            if (!validation.ok) {
                return failure("unknown", "browser_navigate", validation.error, start);
            }
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            return success("unknown", "browser_navigate", `Navigated to ${url}`, start);
        }
        catch (err) {
            return failure("unknown", "browser_navigate", err, start);
        }
    },
};
export const browserClickTool = {
    definition: {
        name: "browser_click",
        description: "Click an element on the active page matched by a CSS selector OR a Snapshot ID.",
        parameters: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector for the element to click. (Provide either selector OR id)" },
                id: { type: "number", description: "The numeric ID from browser_snapshot (e.g. 42). (Provide either selector OR id)" },
            },
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const { selector, id } = args;
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();
            let targetSelector = selector;
            if (id !== undefined) {
                targetSelector = `[data-agent-id="${id}"]`;
            }
            if (!targetSelector)
                throw new Error("Either selector or id must be provided");
            await page.waitForSelector(targetSelector, { timeout: 5000 });
            await page.click(targetSelector);
            return success("unknown", "browser_click", `Clicked element: ${targetSelector}`, start);
        }
        catch (err) {
            return failure("unknown", "browser_click", err, start);
        }
    },
};
export const browserTypeTool = {
    definition: {
        name: "browser_type",
        description: "Type text into an element on the active page matched by a CSS selector OR a Snapshot ID.",
        parameters: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector for the input element. (Provide either selector OR id)" },
                id: { type: "number", description: "The numeric ID from browser_snapshot (e.g. 42). (Provide either selector OR id)" },
                text: { type: "string", description: "The text to type." },
            },
            required: ["text"],
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const { selector, id, text } = args;
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();
            let targetSelector = selector;
            if (id !== undefined) {
                targetSelector = `[data-agent-id="${id}"]`;
            }
            if (!targetSelector)
                throw new Error("Either selector or id must be provided");
            await page.waitForSelector(targetSelector, { timeout: 5000 });
            await page.type(targetSelector, text);
            return success("unknown", "browser_type", `Typed "${text}" into ${targetSelector}`, start);
        }
        catch (err) {
            return failure("unknown", "browser_type", err, start);
        }
    },
};
export const browserScreenshotTool = {
    definition: {
        name: "browser_screenshot",
        description: "Capture a screenshot of the active page.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Optional name for the screenshot file (without extension)." },
            },
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const name = args.name || `screenshot-${Date.now()}`;
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();
            // Store in 'screenshots' directory in workspace root
            const workspaceRoot = context.workspaceRoot || process.cwd();
            const targetDir = path.join(workspaceRoot, "screenshots");
            // Ensure directory exists
            await fs.mkdir(targetDir, { recursive: true });
            // Ensure unique filename to avoid overwrites if name is reused
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `${name}_${timestamp}.png`;
            const filepath = path.join(targetDir, filename);
            await page.screenshot({ path: filepath });
            return success("unknown", "browser_screenshot", `Screenshot saved to ${filepath}`, start);
        }
        catch (err) {
            return failure("unknown", "browser_screenshot", err, start);
        }
    },
};
export const browserGetContentTool = {
    definition: {
        name: "browser_get_content",
        description: "Get the content of the active page in Markdown (default), Text, or HTML format. Use 'markdown' for reading articles.",
        parameters: {
            type: "object",
            properties: {
                format: {
                    type: "string",
                    description: "Format to return: 'markdown' (optimized for reading), 'text' (raw text), or 'html' (raw source). Default is 'markdown'.",
                    enum: ["markdown", "text", "html"]
                },
            },
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const format = args.format || "markdown";
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();
            let content = "";
            let metadata = "";
            if (format === "html") {
                content = await page.content();
            }
            else if (format === "text") {
                content = await page.evaluate(() => document.body.innerText);
            }
            else {
                // Markdown (Readability)
                const html = await page.content();
                const url = page.url();
                // Ensure import works in ESM context
                const { extractReadabilityContent, htmlToMarkdown } = await import("./utils.js");
                try {
                    const result = extractReadabilityContent(html, url);
                    if (result) {
                        const title = result.title ? `# ${result.title}\n\n` : "";
                        const byline = result.byline ? `*By ${result.byline}*\n\n` : "";
                        const originalUrl = `*Source: ${url}*\n\n`;
                        content = `${title}${byline}${originalUrl}${result.content}`;
                    }
                    else {
                        // Fallback if readability fails
                        content = htmlToMarkdown(html);
                    }
                }
                catch (e) {
                    browserLogger?.warn("Readability failed, falling back to raw markdown conversion", e);
                    content = htmlToMarkdown(html);
                }
            }
            // Truncate to avoid context overflow (adjustable)
            const MAX_LEN = 15000;
            const truncated = content.length > MAX_LEN
                ? content.slice(0, MAX_LEN) + `\n\n...[content truncated, original length: ${content.length} chars]...`
                : content;
            return success("unknown", "browser_get_content", truncated, start);
        }
        catch (err) {
            return failure("unknown", "browser_get_content", err, start);
        }
    },
};
export const browserSnapshotTool = {
    definition: {
        name: "browser_snapshot",
        description: "Capture an interactive DOM snapshot of the active page. This returns a compressed text representation of the page, filtering out noise and assigning numeric IDs (e.g. [42]) to interactive elements.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();
            // Inject and execute the snapshot script
            const snapshot = await page.evaluate((script) => {
                // Execute the script string
                return eval(script);
            }, SNAPSHOT_SCRIPT);
            return success("unknown", "browser_snapshot", String(snapshot), start);
        }
        catch (err) {
            return failure("unknown", "browser_snapshot", err, start);
        }
    },
};
//# sourceMappingURL=tools.js.map