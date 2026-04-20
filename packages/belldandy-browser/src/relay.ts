import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";

// Logger interface to avoid circular dependency
interface Logger {
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
}

// 插件通信消息类型定义
type ExtensionMessage =
    | { method: "ping" }
    | { method: "pong" }
    | { id: number; result?: unknown; error?: string } // 对指令的响应
    | { method: "forwardCDPEvent"; params: { method: string; params?: unknown; sessionId?: string } }; // 来自插件的事件

type CdpCommand = {
    id: number;
    method: string;
    params?: unknown;
    sessionId?: string;
};

type CdpResponse = {
    id: number;
    result?: unknown;
    error?: { message: string };
    sessionId?: string;
};

export class RelayServer {
    private server: Server;
    private wssExtension: WebSocketServer;
    private wssCdp: WebSocketServer;
    private extensionWs: WebSocket | null = null;
    private cdpClients = new Set<WebSocket>();

    // 发送给插件的挂起请求（等待响应）
    private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
    private nextId = 1;

    public readonly port: number;
    private logger?: Logger;

    constructor(port: number = 28892, logger?: Logger) {
        this.logger = logger;
        this.port = port;
        this.server = createServer((req, res) => {
            // 基础健康检查与版本信息
            if (req.url === "/json/version") {
                res.writeHead(200, { "Content-Type": "application/json" });
                const wsUrl = `ws://127.0.0.1:${this.port}/cdp`;
                res.end(JSON.stringify({
                    Browser: "Star Sanctuary/Relay",
                    "Protocol-Version": "1.3",
                    webSocketDebuggerUrl: this.extensionWs ? wsUrl : undefined
                }));
                return;
            }
            if (req.url === "/json/list") {
                // 返回一个虚拟 Target，以便 Puppeteer 可以通过 http://.../json/list 进行发现。
                // 在真实实现中，我们应该追踪 Tab 列表。目前暂时返回空数组或单个 Target。
                // Puppeteer 通常通过 /json/version 获取 webSocketDebuggerUrl。
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify([]));
                return;
            }
            res.writeHead(404);
            res.end("Not Found");
        });

        this.wssExtension = new WebSocketServer({ noServer: true });
        this.wssCdp = new WebSocketServer({ noServer: true });

        this.setupExtensionServer();
        this.setupCdpServer();

        this.server.on("upgrade", (req, socket, head) => {
            const url = new URL(req.url ?? "/", "http://localhost");
            if (url.pathname === "/extension") {
                this.wssExtension.handleUpgrade(req, socket, head, (ws) => this.wssExtension.emit("connection", ws, req));
            } else if (url.pathname === "/cdp") {
                this.wssCdp.handleUpgrade(req, socket, head, (ws) => this.wssCdp.emit("connection", ws, req));
            } else {
                socket.destroy();
            }
        });
    }

    private setupExtensionServer() {
        this.wssExtension.on("connection", (ws) => {
            this.logger?.info("Extension connected");
            this.extensionWs = ws;

            ws.on("message", (data) => {
                const dataStr = data.toString();
                // Avoid logging raw ping/pong to keep noise down, but log everything else
                if (!dataStr.includes('"method":"pong"') && !dataStr.includes('"method":"ping"')) {
                    this.logger?.debug(`Extension message: ${dataStr}`);
                }

                try {
                    const msg = JSON.parse(dataStr) as ExtensionMessage;
                    this.handleExtensionMessage(msg);
                } catch (err) {
                    this.logger?.error("Failed to parse extension message", err);
                }
            });

            ws.on("close", () => {
                this.logger?.info("Extension disconnected");
                this.extensionWs = null;
                // 拒绝所有挂起的请求
                for (const p of this.pending.values()) {
                    clearTimeout(p.timer);
                    p.reject(new Error("Extension disconnected"));
                }
                this.pending.clear();
            });
        });
    }

    private setupCdpServer() {
        this.wssCdp.on("connection", (ws) => {
            this.logger?.debug("CDP client connected");
            this.cdpClients.add(ws);

            ws.on("message", async (data) => {
                if (!this.extensionWs) {
                    // 如果插件未连接，立即发送错误响应
                    try {
                        const cmd = JSON.parse(data.toString()) as CdpCommand;
                        if (cmd.id !== undefined) {
                            ws.send(JSON.stringify({
                                id: cmd.id,
                                error: {
                                    code: -32000,
                                    message: "浏览器扩展未连接。请告知用户：1) 确保 Chrome 浏览器正在运行；2) 检查 Star Sanctuary Browser Relay 扩展是否已启用并显示已连接状态；3) 如果问题持续，请让用户刷新扩展或重启浏览器。在扩展重新连接前，浏览器相关功能暂时不可用。"
                                }
                            }));
                        }
                    } catch {
                        // Ignore parse errors
                    }
                    return;
                }

                try {
                    const cmd = JSON.parse(data.toString()) as CdpCommand;
                    this.handleCdpCommand(ws, cmd);
                } catch (err) {
                    this.logger?.error("Failed to parse CDP command", err);
                }
            });

            ws.on("close", () => {
                this.cdpClients.delete(ws);
            });
        });
    }

    private handleExtensionMessage(msg: ExtensionMessage) {
        if ("method" in msg) {
            if (msg.method === "ping") {
                this.sendJson(this.extensionWs, { method: "pong" });
                return;
            }
            if (msg.method === "forwardCDPEvent") {
                // 广播事件给所有连接的 CDP Clients
                const cdpEvent = {
                    method: msg.params.method,
                    params: msg.params.params,
                    sessionId: msg.params.sessionId
                };

                // Patch: Inject browserContextId for attachedToTarget events
                // to match the one we mocked in targetCreated
                if (cdpEvent.method === "Target.attachedToTarget") {
                    const info = (cdpEvent.params as any).targetInfo;
                    if (info) {
                        info.browserContextId = "default-context";
                        if (!info.url) info.url = "http://localhost/placeholder";
                        if (!info.title) info.title = "Active Tab";
                    }
                }
                const payload = JSON.stringify(cdpEvent);
                for (const client of this.cdpClients) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(payload);
                    }
                }
            }
            return;
        }

        if ("id" in msg && typeof msg.id === "number") {
            // 收到我们发送指令的响应
            const p = this.pending.get(msg.id);
            if (p) {
                clearTimeout(p.timer);
                this.pending.delete(msg.id);
                if (msg.error) p.reject(new Error(msg.error));
                else p.resolve(msg.result);
            }
            return;
        }
    }

    private async handleCdpCommand(client: WebSocket, cmd: CdpCommand) {
        this.logger?.debug(`CDP command: ${cmd.method} (ID: ${cmd.id})`);

        // Intercept specific commands
        if (cmd.method === "Target.getBrowserContexts") {
            const response: CdpResponse = {
                id: cmd.id,
                result: {
                    browserContextIds: ["default-context"]
                },
                sessionId: cmd.sessionId
            };
            this.sendJson(client, response, "Sending contexts");
            return;
        }

        if (cmd.method === "Target.setDiscoverTargets") {
            // CRITICAL: Emit Target.targetCreated for existing targets so Puppeteer discovers them
            // Send event BEFORE response
            const targetEvent = {
                method: "Target.targetCreated",
                params: {
                    targetInfo: {
                        targetId: "page-1",
                        type: "page",
                        title: "Active Tab",
                        url: "http://localhost/placeholder",
                        attached: false,
                        canAccessOpener: false,
                        browserContextId: "default-context" // Link to context
                    }
                }
            };
            this.sendJson(client, targetEvent, "Sending targetCreated");

            const response: CdpResponse = {
                id: cmd.id,
                result: {},
                sessionId: cmd.sessionId
            };
            this.sendJson(client, response);

            return;
        }

        if (cmd.method === "Target.setAutoAttach") {
            // 1. Respond OK to the setAutoAttach command itself
            const response: CdpResponse = {
                id: cmd.id,
                result: {},
                sessionId: cmd.sessionId
            };
            this.sendJson(client, response);

            // CRITICAL FIX: Only trigger "Connect to page-1" if this command comes from the BROWSWER (root)
            // If it comes from an existing Session (cmd.sessionId is present), it's Puppeteer looking for iframes/workers.
            // We must NOT trigger a new Page Loop here.
            if (!cmd.sessionId) {
                // 2. TRIGGER the actual attachment via Extension
                // console.log("[Relay] Triggering Extension Attach for page-1 (Root Spec)");
                const attachParams = {
                    targetId: "page-1",
                    flatten: true
                };

                // Send internal command to extension
                const internalId = -999;
                const payload = {
                    method: "forwardCDPCommand",
                    params: {
                        method: "Target.attachToTarget",
                        params: attachParams,
                        sessionId: undefined
                    },
                    id: internalId
                };
                this.sendJson(this.extensionWs, payload);
            }

            return;
        }

        if (cmd.method === "Target.getTargets") {
            // Return a single virtual target representing the active tab
            // In a better implementation, we would track this from Extension events.
            const response: CdpResponse = {
                id: cmd.id,
                result: {
                    targetInfos: [
                        {
                            targetId: "page-1", // Fixed ID for simplicity
                            type: "page",
                            title: "Active Tab",
                            url: "about:blank",
                            attached: false, // Puppeteer will try to attach
                            canAccessOpener: false,
                            browserContextId: "default-context"
                        }
                    ]
                },
                sessionId: cmd.sessionId
            };
            this.sendJson(client, response);
            return;
        }

        // Forward others to extension

        const id = this.nextId++;
        const payload = {
            id,
            method: "forwardCDPCommand",
            params: {
                method: cmd.method,
                params: cmd.params,
                sessionId: cmd.sessionId
            }
        };

        try {
            if (!this.extensionWs || this.extensionWs.readyState !== WebSocket.OPEN) {
                throw new Error("Extension not connected");
            }

            // 发送给 Extension 并等待响应
            this.sendJson(this.extensionWs, payload);

            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.pending.delete(id);
                    reject(new Error("Timeout waiting for extension"));
                }, 30000);
                this.pending.set(id, { resolve, reject, timer });
            });

            // 将结果回传给 CDP Client
            const response: CdpResponse = {
                id: cmd.id,
                result,
                sessionId: cmd.sessionId
            };
            this.sendJson(client, response);

        } catch (err) {
            const response: CdpResponse = {
                id: cmd.id,
                error: { message: err instanceof Error ? err.message : String(err) },
                sessionId: cmd.sessionId
            };
            this.sendJson(client, response);
        }
    }

    private sendJson(
        socket: Pick<WebSocket, "send"> | null | undefined,
        payload: unknown,
        debugLabel?: string,
    ): void {
        if (!socket) return;
        const serialized = JSON.stringify(payload);
        if (debugLabel) {
            this.logger?.debug(`${debugLabel}: ${serialized}`);
        }
        socket.send(serialized);
    }

    public async start() {
        return new Promise<void>((resolve, reject) => {
            this.server.listen(this.port, "127.0.0.1", () => {
                this.logger?.info(`Relay server listening on 127.0.0.1:${this.port}`);
                resolve();
            });
            this.server.on("error", reject);
        });
    }

    public async stop() {
        return new Promise<void>((resolve) => {
            this.server.close(() => resolve());
            this.wssExtension.close();
            this.wssCdp.close();
        });
    }
}
