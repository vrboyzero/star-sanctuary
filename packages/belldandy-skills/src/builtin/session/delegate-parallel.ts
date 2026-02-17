import type { Tool, ToolCallResult } from "../../types.js";
import crypto from "node:crypto";

/**
 * delegate_parallel — 并行委托多个任务给子 Agent
 *
 * 接受 tasks 数组，每个 task 独立运行在子 Agent 中，全部完成后返回聚合结果。
 * 利用 Orchestrator 的排队机制，超出并发上限的任务会自动排队。
 */
export const delegateParallelTool: Tool = {
    definition: {
        name: "delegate_parallel",
        description:
            "Delegate multiple tasks to sub-agents in parallel. Each task runs independently and results are aggregated. " +
            "Use this when you need several specialized agents to work on different parts of a complex task simultaneously.",
        parameters: {
            type: "object",
            properties: {
                tasks: {
                    type: "array",
                    description:
                        "Array of task objects. Each task has: instruction (required), agent_id (optional), context (optional).",
                    items: {
                        type: "object",
                    },
                },
            },
            required: ["tasks"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "delegate_parallel";

        if (!context.agentCapabilities?.spawnParallel) {
            return {
                id,
                name,
                success: false,
                output: "Error: Parallel sub-agent orchestration is not available (capability missing).",
                durationMs: Date.now() - start,
            };
        }

        const tasks = args.tasks as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(tasks) || tasks.length === 0) {
            return {
                id,
                name,
                success: false,
                output: "Error: tasks must be a non-empty array.",
                durationMs: Date.now() - start,
            };
        }

        // Validate and normalize tasks
        const normalized = tasks.map((t, i) => {
            const instruction = typeof t.instruction === "string" ? t.instruction.trim() : "";
            if (!instruction) {
                throw new Error(`Task[${i}]: instruction is required and cannot be empty.`);
            }
            return {
                instruction,
                agentId: typeof t.agent_id === "string" ? t.agent_id : undefined,
                context: (typeof t.context === "object" && t.context !== null ? t.context : undefined) as Record<string, unknown> | undefined,
                parentConversationId: context.conversationId,
            };
        });

        try {
            const results = await context.agentCapabilities.spawnParallel(normalized);

            const lines = results.map((r, i) => {
                const taskLabel = normalized[i].agentId ?? "default";
                const status = r.success ? "OK" : "FAILED";
                const body = r.success ? r.output : (r.error ?? "unknown error");
                return `[Task ${i + 1} / ${taskLabel}] ${status}\n${body}`;
            });

            const allSuccess = results.every((r) => r.success);

            return {
                id,
                name,
                success: allSuccess,
                output: `[delegate_parallel] ${results.length} tasks completed (${results.filter((r) => r.success).length} succeeded).\n\n${lines.join("\n\n---\n\n")}`,
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
