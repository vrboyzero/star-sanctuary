import type { Tool, ToolCallResult } from "../types.js";
import { MemoryManager, getGlobalMemoryManager } from "@belldandy/memory";
import type { MemorySearchFilter, TaskRecord, TaskSearchFilter } from "@belldandy/memory";
import { appendToTodayMemory, readMemoryFile, writeMemoryFile } from "@belldandy/memory";
import path from "node:path";
import { resolveStateDir } from "@belldandy/protocol";

// Singleton instance (lazy init, fallback only)
let memoryManager: MemoryManager | null = null;

function getMemoryManager(workspaceRoot: string): MemoryManager {
    // [FIX] 优先使用 Gateway 注册的全局实例，以便访问 sessions 向量索引
    const global = getGlobalMemoryManager();
    if (global) {
        return global;
    }

    // Fallback: 创建本地实例（用于测试或独立运行场景）
    if (!memoryManager) {
        // [IMPROVED] Use shared models directory if available
        const stateDir = resolveStateDir(process.env);
        const modelsDir = path.join(stateDir, "models");

        memoryManager = new MemoryManager({
            workspaceRoot,
            modelsDir, // Use shared directory to avoid re-downloading per workspace
            // API key is pulled from env by MemoryManager default behavior
        });
        console.log("[memory_search] Created fallback MemoryManager (no global instance found)");
    }
    return memoryManager;
}

export const memorySearchTool: Tool = {
    definition: {
        name: "memory_search",
        description: "Search the knowledge base (files in workspace) using hybrid retrieval (semantic vector search + keyword search). Use this to find information, code snippets, or context from the project. Supports optional metadata filtering by memory type, channel, topic, and date range. Use detail_level='summary' (default) for quick overview, or 'full' for complete content.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query (natural language or keywords).",
                },
                limit: {
                    type: "number",
                    description: "Max number of results to return (default: 5).",
                },
                detail_level: {
                    type: "string",
                    enum: ["summary", "full"],
                    description: "Level of detail: 'summary' returns short summaries (saves tokens), 'full' returns complete content. Default: 'summary'.",
                },
                memory_type: {
                    type: "string",
                    description: "Filter by memory type: 'core' (long-term facts), 'daily' (daily notes), 'session' (conversation history), 'other'. Can be comma-separated for multiple types.",
                },
                channel: {
                    type: "string",
                    description: "Filter by source channel: 'webchat', 'feishu', 'heartbeat', etc.",
                },
                date_from: {
                    type: "string",
                    description: "Filter results from this date (YYYY-MM-DD).",
                },
                date_to: {
                    type: "string",
                    description: "Filter results up to this date (YYYY-MM-DD).",
                },
            },
            required: ["query"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            const query = args.query as string;
            const limit = (args.limit as number) || 5;
            const detailLevel = (args.detail_level as string) || "summary";

            // Build filter from args
            const filter: MemorySearchFilter = {};
            if (args.memory_type) {
                const types = (args.memory_type as string).split(",").map(s => s.trim());
                filter.memoryType = types.length === 1 ? types[0] as any : types as any;
            }
            if (args.channel) filter.channel = args.channel as string;
            if (args.date_from) filter.dateFrom = args.date_from as string;
            if (args.date_to) filter.dateTo = args.date_to as string;

            // Scope 隔离：自动注入 agentId（子 Agent 只检索自己的记忆）
            if (context.agentId) {
                filter.agentId = context.agentId;
            }

            const hasFilter = Object.keys(filter).length > 0;
            const results = await manager.search(query, hasFilter ? { limit, filter } : limit);
            manager.linkTaskMemories(context.conversationId, results.map((item) => item.id), "used");

            // Format results based on detail_level
            const output = results.map(r => {
                const location = `[${r.sourcePath}:${r.startLine || 0}] (Score: ${r.score.toFixed(3)})`;
                if (detailLevel === "full") {
                    return `${location}\n${r.snippet}`;
                }
                // summary mode: prefer summary, fallback to truncated content
                const text = r.summary || truncateForSummary(r.snippet, 200);
                return `${location}\n${text}`;
            }).join("\n\n---\n\n");

            return {
                id: "memory_search",
                name: "memory_search",
                success: true,
                output: output || "No relevant results found.",
                durationMs: Date.now() - start,
            };

        } catch (err) {
            return {
                id: "memory_search",
                name: "memory_search",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

export const memoryIndexTool: Tool = {
    definition: {
        name: "memory_index",
        description: "Trigger a re-index of the workspace files into the memory. Use this after significant file changes or manually.",
        parameters: {
            type: "object",
            properties: {},
        },
    },

    async execute(_args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            await manager.indexWorkspace();
            const status = manager.getStatus();

            return {
                id: "memory_index",
                name: "memory_index",
                success: true,
                output: `Indexing completed. Files: ${status.files}, Chunks: ${status.chunks}, Vectors: ${status.vectorIndexed || 0}, Cached: ${status.vectorCached || 0}, Summarized: ${status.summarized || 0}, Summary Pending: ${status.summaryPending || 0}`,
                durationMs: Date.now() - start,
            };

        } catch (err) {
            return {
                id: "memory_index",
                name: "memory_index",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

export const memoryReadTool: Tool = {
    definition: {
        name: "memory_read",
        description: "Read a memory file such as MEMORY.md or memory/YYYY-MM-DD.md.",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Memory file path, such as MEMORY.md or memory/2026-03-15.md.",
                },
                from: {
                    type: "number",
                    description: "Optional 1-based start line.",
                },
                lines: {
                    type: "number",
                    description: "Optional number of lines to read.",
                },
            },
            required: ["path"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            const relPath = String(args.path ?? "").trim();
            const from = typeof args.from === "number" ? args.from : undefined;
            const lines = typeof args.lines === "number" ? args.lines : undefined;
            const result = await readMemoryFile({
                workspaceDir: context.workspaceRoot,
                relPath,
                from,
                lines,
            });
            await manager.linkTaskMemoriesFromSource(context.conversationId, result.path, "used");

            return {
                id: "memory_read",
                name: "memory_read",
                success: true,
                output: `Path: ${result.path}\nTotal Lines: ${result.totalLines}\n\n${result.text}`,
                durationMs: Date.now() - start,
            };
        } catch (err) {
            return {
                id: "memory_read",
                name: "memory_read",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

export const memoryWriteTool: Tool = {
    definition: {
        name: "memory_write",
        description: "Write to a memory file. By default this appends to today's daily memory file.",
        parameters: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "Memory content to write.",
                },
                path: {
                    type: "string",
                    description: "Optional target memory file path. Defaults to today's daily memory file.",
                },
                mode: {
                    type: "string",
                    enum: ["append", "overwrite"],
                    description: "Write mode. Default is append.",
                },
            },
            required: ["content"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            const content = String(args.content ?? "").trim();
            const relPath = typeof args.path === "string" && args.path.trim()
                ? args.path.trim()
                : null;
            const mode = args.mode === "overwrite" ? "overwrite" : "append";

            const filePath = relPath
                ? await writeMemoryFile({
                    workspaceDir: context.workspaceRoot,
                    relPath,
                    content,
                    mode,
                })
                : await appendToTodayMemory(context.workspaceRoot, content);

            await manager.linkTaskMemoriesFromSource(context.conversationId, filePath, "generated");

            return {
                id: "memory_write",
                name: "memory_write",
                success: true,
                output: `Memory written: ${filePath}`,
                durationMs: Date.now() - start,
            };
        } catch (err) {
            return {
                id: "memory_write",
                name: "memory_write",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

export const taskSearchTool: Tool = {
    definition: {
        name: "task_search",
        description: "Search historical task summaries. Use this to find similar completed tasks, past failures, or reusable execution patterns.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Keyword or natural language query for past tasks.",
                },
                limit: {
                    type: "number",
                    description: "Max number of results to return (default: 5).",
                },
                status: {
                    type: "string",
                    description: "Filter by task status: success, failed, partial, running. Can be comma-separated.",
                },
                source: {
                    type: "string",
                    description: "Filter by task source: chat, sub_agent, cron, heartbeat, manual. Can be comma-separated.",
                },
                date_from: {
                    type: "string",
                    description: "Filter results from this date (YYYY-MM-DD).",
                },
                date_to: {
                    type: "string",
                    description: "Filter results up to this date (YYYY-MM-DD).",
                },
            },
            required: ["query"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            const query = String(args.query ?? "").trim();
            const limit = (args.limit as number) || 5;
            const filter = buildTaskFilter(args, context.agentId);
            const results = manager.searchTasks(query, { limit, filter });

            return {
                id: "task_search",
                name: "task_search",
                success: true,
                output: formatTaskList(results) || "No matching tasks found.",
                durationMs: Date.now() - start,
            };
        } catch (err) {
            return {
                id: "task_search",
                name: "task_search",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

export const taskRecentTool: Tool = {
    definition: {
        name: "task_recent",
        description: "List recent task summaries. Useful for checking what Belldandy has just completed.",
        parameters: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Max number of results to return (default: 5).",
                },
                status: {
                    type: "string",
                    description: "Filter by task status: success, failed, partial, running. Can be comma-separated.",
                },
                source: {
                    type: "string",
                    description: "Filter by task source: chat, sub_agent, cron, heartbeat, manual. Can be comma-separated.",
                },
            },
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            const limit = (args.limit as number) || 5;
            const filter = buildTaskFilter(args, context.agentId);
            const results = manager.getRecentTasks(limit, filter);

            return {
                id: "task_recent",
                name: "task_recent",
                success: true,
                output: formatTaskList(results) || "No recent tasks found.",
                durationMs: Date.now() - start,
            };
        } catch (err) {
            return {
                id: "task_recent",
                name: "task_recent",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

export const taskGetTool: Tool = {
    definition: {
        name: "task_get",
        description: "Get the full detail of a task summary by task ID.",
        parameters: {
            type: "object",
            properties: {
                task_id: {
                    type: "string",
                    description: "The task ID returned by task_search or task_recent.",
                },
            },
            required: ["task_id"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            const taskId = String(args.task_id ?? "").trim();
            const task = manager.getTaskDetail(taskId);

            return {
                id: "task_get",
                name: "task_get",
                success: true,
                output: task ? formatTaskDetail(task) : "Task not found.",
                durationMs: Date.now() - start,
            };
        } catch (err) {
            return {
                id: "task_get",
                name: "task_get",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

// ============================================================================
// Legacy / Compatibility Exports
// ============================================================================

export type MemorySearchToolConfig = {
    // Configuration properties if needed for backward compatibility
    storePath?: string;
};

export function createMemorySearchTool(config?: MemorySearchToolConfig): Tool {
    // In the new singleton architecture, config is handled by the environment/defaults
    // or we could pass config to the first getMemoryManager call if not initialized.
    // For now, return the singleton tool.
    return memorySearchTool;
}

export function createMemoryGetTool(): Tool {
    return {
        definition: {
            name: "memory_get",
            description: "[Deprecated] Retrieve raw memory/file content. Please use 'file_read' or 'memory_search' instead.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Path to the file or memory item to retrieve."
                    }
                },
                required: ["path"]
            },
        },
        async execute(args, context): Promise<ToolCallResult> {
            return {
                id: "memory_get",
                name: "memory_get",
                success: false,
                output: "",
                error: "This tool is deprecated. Please use 'file_read' to read files or 'memory_search' to find content.",
                durationMs: 0
            };
        }
    };
}

// ============================================================================
// Helpers
// ============================================================================

/** 截断文本用于 summary 模式降级（无 LLM 摘要时的 fallback） */
function truncateForSummary(text: string, maxLen: number): string {
    if (!text || text.length <= maxLen) return text;
    // 尝试在句号/换行处截断，避免截断在词中间
    const cut = text.slice(0, maxLen);
    const lastBreak = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
    if (lastBreak > maxLen * 0.5) {
        return cut.slice(0, lastBreak + 1);
    }
    return cut + "...";
}

function buildTaskFilter(args: Record<string, unknown>, agentId?: string): TaskSearchFilter | undefined {
    const filter: TaskSearchFilter = {};

    if (args.status) {
        const values = String(args.status).split(",").map((value) => value.trim()).filter(Boolean);
        if (values.length === 1) {
            filter.status = values[0] as TaskSearchFilter["status"];
        } else if (values.length > 1) {
            filter.status = values as Exclude<TaskSearchFilter["status"], string>;
        }
    }

    if (args.source) {
        const values = String(args.source).split(",").map((value) => value.trim()).filter(Boolean);
        if (values.length === 1) {
            filter.source = values[0] as TaskSearchFilter["source"];
        } else if (values.length > 1) {
            filter.source = values as Exclude<TaskSearchFilter["source"], string>;
        }
    }

    if (args.date_from) filter.dateFrom = String(args.date_from);
    if (args.date_to) filter.dateTo = String(args.date_to);
    if (agentId) filter.agentId = agentId;

    return Object.keys(filter).length > 0 ? filter : undefined;
}

function formatTaskList(tasks: TaskRecord[]): string {
    return tasks.map((task) => {
        const title = task.title || task.objective || task.id;
        const meta = [
            task.id,
            task.status,
            task.source,
            task.finishedAt || task.startedAt,
        ].filter(Boolean).join(" | ");
        const summary = task.summary || task.reflection || "No summary.";
        return `[${meta}]\n${title}\n${truncateForSummary(summary, 220)}`;
    }).join("\n\n---\n\n");
}

function formatTaskDetail(task: TaskRecord & { memoryLinks?: Array<{ chunkId: string; relation: string; sourcePath?: string; memoryType?: string; snippet?: string }> }): string {
    const lines: string[] = [];
    lines.push(`Task: ${task.title || task.objective || task.id}`);
    lines.push(`ID: ${task.id}`);
    lines.push(`Status: ${task.status}`);
    lines.push(`Source: ${task.source}`);
    lines.push(`Conversation: ${task.conversationId}`);
    if (task.parentConversationId) lines.push(`Parent Conversation: ${task.parentConversationId}`);
    if (task.agentId) lines.push(`Agent: ${task.agentId}`);
    lines.push(`Started: ${task.startedAt}`);
    if (task.finishedAt) lines.push(`Finished: ${task.finishedAt}`);
    if (typeof task.durationMs === "number") lines.push(`Duration: ${task.durationMs}ms`);
    if (typeof task.tokenTotal === "number") {
        lines.push(
            `Tokens: total=${task.tokenTotal}, input=${task.tokenInput ?? 0}, output=${task.tokenOutput ?? 0}`,
        );
    }

    if (task.objective) {
        lines.push("");
        lines.push("Objective:");
        lines.push(task.objective);
    }

    if (task.summary) {
        lines.push("");
        lines.push("Summary:");
        lines.push(task.summary);
    }

    if (task.reflection) {
        lines.push("");
        lines.push("Reflection:");
        lines.push(task.reflection);
    }

    if (task.artifactPaths?.length) {
        lines.push("");
        lines.push("Artifacts:");
        for (const item of task.artifactPaths) {
            lines.push(`- ${item}`);
        }
    }

    if (task.toolCalls?.length) {
        lines.push("");
        lines.push("Tools:");
        for (const item of task.toolCalls) {
            const meta = [
                item.success ? "success" : "failed",
                typeof item.durationMs === "number" ? `${item.durationMs}ms` : "",
            ].filter(Boolean).join(" | ");
            lines.push(`- ${item.toolName}${meta ? ` (${meta})` : ""}`);
            if (item.note) {
                lines.push(`  note: ${truncateForSummary(item.note, 180)}`);
            }
            if (item.artifactPaths?.length) {
                lines.push(`  artifacts: ${item.artifactPaths.join(", ")}`);
            }
        }
    }

    if (task.memoryLinks?.length) {
        lines.push("");
        lines.push("Memory Links:");
        for (const item of task.memoryLinks) {
            const meta = [item.relation, item.memoryType, item.sourcePath].filter(Boolean).join(" | ");
            lines.push(`- ${meta || item.relation}: ${item.chunkId}`);
            if (item.snippet) {
                lines.push(`  snippet: ${item.snippet}`);
            }
        }
    }

    return lines.join("\n");
}
