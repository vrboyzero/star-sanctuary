import type { Tool, ToolCallResult } from "../../types.js";
import crypto from "node:crypto";

export const sessionsSpawnTool: Tool = {
    definition: {
        name: "sessions_spawn",
        description: "Spawn a sub-agent to handle a complex task independently. The sub-agent runs in a separate context but shares the workspace.",
        parameters: {
            type: "object",
            properties: {
                instruction: {
                    type: "string",
                    description: "The detailed instruction or goal for the sub-agent.",
                },
                agent_id: {
                    type: "string",
                    description: "Target agent profile ID (e.g. 'coder', 'researcher'). Omit to use default agent.",
                },
                context: {
                    type: "object",
                    description: "Optional structured context to pass to the sub-agent.",
                },
            },
            required: ["instruction"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "sessions_spawn";

        if (!context.agentCapabilities?.spawnSubAgent) {
            return {
                id,
                name,
                success: false,
                output: "Error: Host agent does not support spawning sub-agents (capability missing).",
                durationMs: Date.now() - start,
            };
        }

        try {
            const result = await context.agentCapabilities.spawnSubAgent({
                instruction: args.instruction as string,
                agentId: args.agent_id as string | undefined,
                context: args.context as Record<string, unknown> | undefined,
                parentConversationId: context.conversationId,
            });

            return {
                id,
                name,
                success: result.success,
                output: result.output || (result.success ? "Sub-agent finished successfully." : "Sub-agent failed."),
                error: result.error,
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
