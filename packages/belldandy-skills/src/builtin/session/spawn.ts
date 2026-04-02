import type { Tool, ToolCallResult } from "../../types.js";
import crypto from "node:crypto";
import { withToolContract } from "../../tool-contract.js";
import { buildSubAgentLaunchSpec } from "../../subagent-launch.js";

export const sessionsSpawnTool: Tool = withToolContract({
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
            const launchSpec = buildSubAgentLaunchSpec(context, {
                instruction: args.instruction as string,
                agentId: args.agent_id as string | undefined,
                context: args.context as Record<string, unknown> | undefined,
                channel: "subtask",
            });
            const result = await context.agentCapabilities.spawnSubAgent(launchSpec);
            const taskDetails = [
                result.taskId ? `Task ID: ${result.taskId}` : "",
                result.sessionId ? `Session ID: ${result.sessionId}` : "",
                result.outputPath ? `Output Path: ${result.outputPath}` : "",
            ].filter(Boolean).join("\n");

            return {
                id,
                name,
                success: result.success,
                output: [
                    result.output || (result.success ? "Sub-agent finished successfully." : "Sub-agent failed."),
                    taskDetails,
                ].filter(Boolean).join("\n\n"),
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
}, {
    family: "session-orchestration",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: false,
    riskLevel: "medium",
    channels: ["gateway", "web"],
    safeScopes: ["local-safe", "web-safe"],
    activityDescription: "Spawn a sub-agent session to work on an independent task",
    resultSchema: {
        kind: "text",
        description: "Sub-agent completion summary text.",
    },
    outputPersistencePolicy: "conversation",
});
