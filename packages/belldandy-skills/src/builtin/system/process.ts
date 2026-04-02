import type { Tool, ToolCallResult } from "../../types.js";
import { exec } from "node:child_process";
import crypto from "node:crypto";
import util from "node:util";
import { withToolContract } from "../../tool-contract.js";

const execAsync = util.promisify(exec);

export const processManagerTool: Tool = withToolContract({
    definition: {
        name: "process_manager",
        description: "简单的进程管理工具（查看与终止）。支持 `list` (列出前20个消耗资源的进程) 和 `kill` (按 PID 终止)。",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["list", "kill"],
                    description: "操作类型",
                },
                pid: {
                    type: "number",
                    description: "要终止的进程 PID (仅 kill 模式需要)",
                },
            },
            required: ["action"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "process_manager";
        const action = args.action as string;

        try {
            if (action === "list") {
                // 跨平台进程列表
                const platform = process.platform;
                let cmd: string;
                
                if (platform === "win32") {
                    // Windows: tasklist
                    cmd = `tasklist /FO CSV /NH`;
                } else if (platform === "darwin") {
                    // macOS: BSD ps (不支持 --sort)
                    cmd = `ps -eo pid,pcpu,pmem,comm | sort -rnk2 | head -n 20`;
                } else {
                    // Linux: GNU ps
                    cmd = `ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -n 20`;
                }

                const { stdout } = await execAsync(cmd);
                return {
                    id,
                    name,
                    success: true,
                    output: stdout.trim() || "No processes found.",
                    durationMs: Date.now() - start,
                };
            }

            if (action === "kill") {
                const pid = args.pid as number;
                if (!pid) throw new Error("Missing PID for kill action");

                // 简单的保护：禁止杀掉自己 (大约)
                if (pid === process.pid || pid === 0 || pid === 1) {
                    throw new Error("Operation not permitted: Cannot kill system/self process.");
                }

                const isWin = process.platform === "win32";
                const cmd = isWin ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`;

                await execAsync(cmd);
                return {
                    id,
                    name,
                    success: true,
                    output: `Process ${pid} killed.`,
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
    family: "process-control",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: "critical",
    channels: ["gateway", "web"],
    safeScopes: ["privileged"],
    activityDescription: "Inspect or terminate host processes",
    resultSchema: {
        kind: "text",
        description: "Process list output or process termination result text.",
    },
    outputPersistencePolicy: "conversation",
});
