import { MemoryManager, getGlobalMemoryManager } from "@belldandy/memory";
import path from "node:path";
// Singleton instance (lazy init, fallback only)
let memoryManager = null;
function getMemoryManager(workspaceRoot) {
    // [FIX] 优先使用 Gateway 注册的全局实例，以便访问 sessions 向量索引
    const global = getGlobalMemoryManager();
    if (global) {
        return global;
    }
    // Fallback: 创建本地实例（用于测试或独立运行场景）
    if (!memoryManager) {
        // [IMPROVED] Use shared models directory if available
        const stateDir = process.env.BELLDANDY_STATE_DIR;
        const modelsDir = stateDir ? path.join(stateDir, "models") : undefined;
        memoryManager = new MemoryManager({
            workspaceRoot,
            modelsDir, // Use shared directory to avoid re-downloading per workspace
            // API key is pulled from env by MemoryManager default behavior
        });
        console.log("[memory_search] Created fallback MemoryManager (no global instance found)");
    }
    return memoryManager;
}
export const memorySearchTool = {
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
    async execute(args, context) {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            const query = args.query;
            const limit = args.limit || 5;
            const detailLevel = args.detail_level || "summary";
            // Build filter from args
            const filter = {};
            if (args.memory_type) {
                const types = args.memory_type.split(",").map(s => s.trim());
                filter.memoryType = types.length === 1 ? types[0] : types;
            }
            if (args.channel)
                filter.channel = args.channel;
            if (args.date_from)
                filter.dateFrom = args.date_from;
            if (args.date_to)
                filter.dateTo = args.date_to;
            // Scope 隔离：自动注入 agentId（子 Agent 只检索自己的记忆）
            if (context.agentId) {
                filter.agentId = context.agentId;
            }
            const hasFilter = Object.keys(filter).length > 0;
            const results = await manager.search(query, hasFilter ? { limit, filter } : limit);
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
        }
        catch (err) {
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
export const memoryIndexTool = {
    definition: {
        name: "memory_index",
        description: "Trigger a re-index of the workspace files into the memory. Use this after significant file changes or manually.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    async execute(_args, context) {
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
        }
        catch (err) {
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
export function createMemorySearchTool(config) {
    // In the new singleton architecture, config is handled by the environment/defaults
    // or we could pass config to the first getMemoryManager call if not initialized.
    // For now, return the singleton tool.
    return memorySearchTool;
}
export function createMemoryGetTool() {
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
        async execute(args, context) {
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
function truncateForSummary(text, maxLen) {
    if (!text || text.length <= maxLen)
        return text;
    // 尝试在句号/换行处截断，避免截断在词中间
    const cut = text.slice(0, maxLen);
    const lastBreak = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
    if (lastBreak > maxLen * 0.5) {
        return cut.slice(0, lastBreak + 1);
    }
    return cut + "...";
}
//# sourceMappingURL=memory.js.map