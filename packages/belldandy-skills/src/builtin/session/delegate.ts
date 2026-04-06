import type { Tool, ToolCallResult } from "../../types.js";
import crypto from "node:crypto";
import { withToolContract } from "../../tool-contract.js";
import { buildSubAgentLaunchSpec } from "../../subagent-launch.js";

/**
 * delegate_task — 委托任务给指定子 Agent
 *
 * 比 sessions_spawn 更语义化：明确指定目标 Agent Profile，
 * 适用于多 Agent 协作场景（如 "让 coder 写代码"、"让 researcher 查资料"）。
 */
export const delegateTaskTool: Tool = withToolContract({
    definition: {
        name: "delegate_task",
        description:
            "Delegate a task to a specific sub-agent. The sub-agent runs independently and returns the result. " +
            "Use this when you need a specialized agent (e.g. 'coder', 'researcher') to handle part of a complex task.",
        parameters: {
            type: "object",
            properties: {
                agent_id: {
                    type: "string",
                    description:
                        "Target agent profile ID (e.g. 'coder', 'researcher'). Omit to use the default agent.",
                },
                instruction: {
                    type: "string",
                    description: "Detailed instruction for the sub-agent. Be specific about the expected output.",
                },
                context: {
                    type: "object",
                    description: "Optional structured context to pass (e.g. file paths, parameters).",
                },
            },
            required: ["instruction"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "delegate_task";

        if (!context.agentCapabilities?.spawnSubAgent) {
            return {
                id,
                name,
                success: false,
                output: "Error: Sub-agent orchestration is not available (capability missing).",
                durationMs: Date.now() - start,
            };
        }

        const instruction = args.instruction as string;
        if (!instruction?.trim()) {
            return {
                id,
                name,
                success: false,
                output: "Error: instruction is required and cannot be empty.",
                durationMs: Date.now() - start,
            };
        }

        try {
            const launchSpec = buildSubAgentLaunchSpec(context, {
                instruction,
                agentId: args.agent_id as string | undefined,
                context: args.context as Record<string, unknown> | undefined,
                channel: "subtask",
                delegationSource: "delegate_task",
            });
            const result = await context.agentCapabilities.spawnSubAgent(launchSpec);

            const output = [
                result.success
                    ? `[delegate_task] Agent "${args.agent_id ?? "default"}" completed successfully.\n\n${result.output}`
                    : `[delegate_task] Agent "${args.agent_id ?? "default"}" failed: ${result.error ?? "unknown error"}`,
                result.taskId ? `Task ID: ${result.taskId}` : "",
                result.sessionId ? `Session ID: ${result.sessionId}` : "",
                result.outputPath ? `Output Path: ${result.outputPath}` : "",
            ].filter(Boolean).join("\n");

            return {
                id,
                name,
                success: result.success,
                output,
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
    activityDescription: "Delegate a task to a specific sub-agent profile",
    resultSchema: {
        kind: "text",
        description: "Delegated task status and synthesized sub-agent output text.",
    },
    outputPersistencePolicy: "conversation",
});
