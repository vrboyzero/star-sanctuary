import type { Tool, ToolCallResult } from "../../types.js";
import { PtyManager } from "./pty.js";
import crypto from "node:crypto";
import { withToolContract } from "../../tool-contract.js";

export const terminalTool: Tool = withToolContract({
    definition: {
        name: "terminal",
        description: "管理交互式终端会话 (PTY)。支持持久化 Shell、交互式命令 (vim, git commit)、TUI 应用。比 `run_command` 更强大，但需要手动管理会话 (start/write/read/kill)。",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["start", "write", "read", "resize", "kill", "list"],
                    description: "操作类型",
                },
                // For 'start'
                cmd: {
                    type: "string",
                    description: "要启动的 Shell (默认: Windows=cmd.exe, 其他=bash；需 PowerShell 可传 powershell.exe)",
                },
                args: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '命令参数'
                },
                cwd: {
                    type: "string",
                    description: "工作目录",
                },
                cols: { type: "number", description: "终端列数 (default 80)" },
                rows: { type: "number", description: "终端行数 (default 24)" },

                // For 'write', 'read', 'resize', 'kill'
                id: {
                    type: "string",
                    description: "会话 ID (由 start 返回)",
                },

                // For 'write'
                data: {
                    type: "string",
                    description: "要发送到终端的输入数据 (支持换行符 \\n)",
                },
            },
            required: ["action"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "terminal";
        const action = args.action as string;
        const manager = PtyManager.getInstance();

        try {
            if (action === "start") {
                const sessionId = await manager.createSession(
                    (args.cmd as string) || "",
                    (args.args as string[]) || [],
                    {
                        cwd: args.cwd as string,
                        cols: args.cols as number,
                        rows: args.rows as number,
                    }
                );
                return {
                    id,
                    name,
                    success: true,
                    output: `Terminal session started. ID: ${sessionId}\nUse action='read' id='${sessionId}' to see output.`,
                    durationMs: Date.now() - start,
                };
            }

            if (action === "list") {
                const sessions = manager.list();
                const info = sessions.length === 0 ? "No active sessions." :
                    sessions.map(s => `ID: ${s.id} (PID: ${s.pid}) Cmd: ${s.cmd}`).join("\n");
                return { id, name, success: true, output: info, durationMs: Date.now() - start };
            }

            const sessionId = args.id as string;
            if (!sessionId) throw new Error(`Missing 'id' for action '${action}'`);

            if (action === "write") {
                const data = args.data as string;
                if (data === undefined) throw new Error("Missing 'data' for action 'write'");
                manager.write(sessionId, data);

                // Auto-read after write to verify feedback, wait small delay
                await new Promise(r => setTimeout(r, 100));
                const output = manager.read(sessionId);

                return {
                    id,
                    name,
                    success: true,
                    output: output || "(No output yet)",
                    durationMs: Date.now() - start,
                };
            }

            if (action === "read") {
                const output = manager.read(sessionId);
                return {
                    id,
                    name,
                    success: true,
                    output: output || "(No new output)",
                    durationMs: Date.now() - start,
                };
            }

            if (action === "resize") {
                manager.resize(sessionId, (args.cols as number) || 80, (args.rows as number) || 24);
                return {
                    id,
                    name,
                    success: true,
                    output: "Resized.",
                    durationMs: Date.now() - start,
                };
            }

            if (action === "kill") {
                manager.kill(sessionId);
                return {
                    id,
                    name,
                    success: true,
                    output: `Session ${sessionId} killed.`,
                    durationMs: Date.now() - start,
                };
            }

            throw new Error(`Unknown action: ${action}`);

        } catch (err) {
            return {
                id,
                name,
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
}, {
    family: "command-exec",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: "critical",
    channels: ["gateway", "web"],
    safeScopes: ["privileged"],
    activityDescription: "Manage persistent interactive terminal sessions",
    resultSchema: {
        kind: "text",
        description: "Terminal session status or captured terminal output text.",
    },
    outputPersistencePolicy: "conversation",
});
