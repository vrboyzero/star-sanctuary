import type { Tool, ToolCallResult } from "../../types.js";
import crypto from "node:crypto";

export const sessionsHistoryTool: Tool = {
    definition: {
        name: "sessions_history",
        description: "List all active or past sub-agent sessions and their statuses.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },

    async execute(_args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "sessions_history";

        if (!context.agentCapabilities?.listSessions) {
            return {
                id,
                name,
                success: false,
                output: "Error: Host agent does not support listing sessions (capability missing).",
                durationMs: Date.now() - start,
            };
        }

        try {
            const sessions = await context.agentCapabilities.listSessions(context.conversationId);

            const summary = sessions.map(s =>
                `- [${s.status.toUpperCase()}] ID: ${s.id}${s.agentId ? ` (agent: ${s.agentId})` : ""} (Created: ${new Date(s.createdAt).toISOString()}) ${s.summary ? `\n  Summary: ${s.summary}` : ""}`
            ).join("\n");

            return {
                id,
                name,
                success: true,
                output: summary || "No active or past sessions found.",
                durationMs: Date.now() - start,
            };

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
};
