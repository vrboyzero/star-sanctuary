import type { Tool, ToolCallResult } from "../../types.js";
import crypto from "node:crypto";
import { withToolContract } from "../../tool-contract.js";
import { buildSubAgentLaunchSpec } from "../../subagent-launch.js";
import { buildFailureToolCallResult } from "../../failure-kind.js";
import {
    buildDelegationResultFollowUpStrategy,
    DELEGATION_CONTRACT_PARAMETER_PROPERTIES,
    buildDelegationResultToolMetadata,
    evaluateDelegationResultGate,
    renderDelegationResultGateReport,
    readStructuredDelegationContractArgs,
} from "./delegation-contract.js";
import type { DelegationTeamMetadata, DelegationTeamMode } from "../../delegation-protocol.js";

/**
 * delegate_parallel — 并行委托多个任务给子 Agent
 *
 * 接受 tasks 数组，每个 task 独立运行在子 Agent 中，全部完成后返回聚合结果。
 * 利用 Orchestrator 的排队机制，超出并发上限的任务会自动排队。
 */
export const delegateParallelTool: Tool = withToolContract({
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
                        properties: {
                            instruction: {
                                type: "string",
                                description: "Detailed instruction for this delegated subtask.",
                            },
                            agent_id: {
                                type: "string",
                                description: "Optional target agent profile ID for this subtask.",
                            },
                            context: {
                                type: "object",
                                description: "Optional structured context for this subtask.",
                            },
                            ...DELEGATION_CONTRACT_PARAMETER_PROPERTIES,
                        },
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
        const makeError = (
            error: string,
            output: string = "",
            failureKind?: ToolCallResult["failureKind"],
        ): ToolCallResult => buildFailureToolCallResult({
            id,
            name,
            start,
            error,
            output,
            ...(failureKind ? { failureKind } : {}),
        });

        if (!context.agentCapabilities?.spawnParallel) {
            return makeError(
                "Error: Parallel sub-agent orchestration is not available (capability missing).",
                "Error: Parallel sub-agent orchestration is not available (capability missing).",
                "environment_error",
            );
        }

        const tasks = args.tasks as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(tasks) || tasks.length === 0) {
            return makeError(
                "Error: tasks must be a non-empty array.",
                "Error: tasks must be a non-empty array.",
                "input_error",
            );
        }

        const preparedTasks = tasks.map((t, i) => {
            const instruction = typeof t.instruction === "string" ? t.instruction.trim() : "";
            if (!instruction) {
                throw new Error(`Task[${i}]: instruction is required and cannot be empty.`);
            }
            const delegationContract = readStructuredDelegationContractArgs(t);
            return {
                laneId: `lane_${i + 1}`,
                instruction,
                agentId: typeof t.agent_id === "string" ? t.agent_id : undefined,
                context: (typeof t.context === "object" && t.context !== null ? t.context : undefined) as Record<string, unknown> | undefined,
                delegationContract,
            };
        });

        const sharedTeamMetadata = buildParallelTeamMetadata({
            managerAgentId: context.agentId ?? context.launchSpec?.agentId,
            tasks: preparedTasks,
        });

        // Validate and normalize tasks
        const normalized = preparedTasks.map((prepared) => {
            return buildSubAgentLaunchSpec(context, {
                instruction: prepared.instruction,
                agentId: prepared.agentId,
                context: prepared.context,
                channel: "subtask",
                delegationSource: "delegate_parallel",
                aggregationMode: "parallel_collect",
                ownership: prepared.delegationContract.ownership,
                acceptance: prepared.delegationContract.acceptance,
                deliverableContract: prepared.delegationContract.deliverableContract,
                team: {
                    ...sharedTeamMetadata,
                    currentLaneId: prepared.laneId,
                },
            });
        });

        try {
            const results = await context.agentCapabilities.spawnParallel(normalized);
            const reviewed = results.map((result, index) => {
                const gate = result.success
                    ? evaluateDelegationResultGate({
                        output: result.output,
                        contract: normalized[index]?.delegationProtocol,
                    })
                    : undefined;
                const accepted = result.success && (!gate || !gate.enforced || gate.accepted);
                const gateReport = gate ? renderDelegationResultGateReport(gate) : undefined;
                const gateError = gate?.enforced && !gate.accepted
                    ? `Delegation acceptance gate rejected the sub-agent result. ${gate.summary}`
                    : undefined;
                return {
                    result,
                    gate,
                    accepted,
                    gateReport,
                    gateError,
                };
            });

            const lines = reviewed.map(({ result, accepted, gateReport, gateError }, i) => {
                const taskLabel = normalized[i].agentId ?? "default";
                const status = accepted ? "ACCEPTED" : gateError ? "REJECTED" : "FAILED";
                const body = accepted
                    ? result.output
                    : gateError
                        ? `${result.output}\n\n${gateError}`.trim()
                        : (result.error ?? "unknown error");
                const meta = [
                    gateReport ?? "",
                    result.taskId ? `Task ID: ${result.taskId}` : "",
                    result.sessionId ? `Session ID: ${result.sessionId}` : "",
                    result.outputPath ? `Output Path: ${result.outputPath}` : "",
                ].filter(Boolean).join("\n");
                return `[Task ${i + 1} / ${taskLabel}] ${status}\n${body}${meta ? `\n${meta}` : ""}`;
            });

            const workerSuccessCount = reviewed.filter(({ result }) => result.success).length;
            const acceptedCount = reviewed.filter(({ accepted }) => accepted).length;
            const gateRejectedCount = reviewed.filter(({ result, gate }) => result.success && gate?.enforced && !gate.accepted).length;
            const allSuccess = reviewed.every(({ accepted }) => accepted);
            const delegationResults = reviewed.map(({ result, accepted, gate }, index) => ({
                label: `Task ${index + 1} / ${normalized[index]?.agentId ?? "default"}`,
                laneId: preparedTasks[index]?.laneId,
                scopeSummary: preparedTasks[index]?.delegationContract.ownership?.scopeSummary
                    ?? sharedTeamMetadata.memberRoster.find((member) => member.laneId === preparedTasks[index]?.laneId)?.scopeSummary,
                dependsOn: sharedTeamMetadata.memberRoster.find((member) => member.laneId === preparedTasks[index]?.laneId)?.dependsOn,
                handoffTo: sharedTeamMetadata.memberRoster.find((member) => member.laneId === preparedTasks[index]?.laneId)?.handoffTo,
                workerSuccess: result.success,
                accepted,
                error: result.error,
                taskId: result.taskId,
                sessionId: result.sessionId,
                outputPath: result.outputPath,
                acceptanceGate: gate,
            }));

            return {
                id,
                name,
                success: allSuccess,
                output: `[delegate_parallel] ${results.length} tasks completed (${workerSuccessCount} worker succeeded, ${acceptedCount} accepted, ${gateRejectedCount} rejected by acceptance gate).\n\n${lines.join("\n\n---\n\n")}`,
                ...(!allSuccess
                    ? { failureKind: gateRejectedCount > 0 ? "business_logic_error" : "environment_error" }
                    : {}),
                durationMs: Date.now() - start,
                metadata: buildDelegationResultToolMetadata({
                    delegationResults,
                    acceptedCount,
                    gateRejectedCount,
                    workerSuccessCount,
                    followUpStrategy: buildDelegationResultFollowUpStrategy({
                        toolName: "delegate_parallel",
                        requestArguments: args as Record<string, unknown>,
                        delegationResults,
                    }),
                    team: sharedTeamMetadata,
                }),
            };
        } catch (err) {
            return makeError(err instanceof Error ? err.message : String(err), "", "environment_error");
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
    activityDescription: "Delegate multiple tasks to sub-agents in parallel",
    resultSchema: {
        kind: "text",
        description: "Aggregated parallel delegation status and outputs.",
    },
    outputPersistencePolicy: "conversation",
});

function buildParallelTeamMetadata(input: {
    managerAgentId?: string;
    tasks: Array<{
        laneId: string;
        instruction: string;
        agentId?: string;
        delegationContract: ReturnType<typeof readStructuredDelegationContractArgs>;
    }>;
}): DelegationTeamMetadata {
    const mode = inferParallelTeamMode(input.tasks);
    const sharedGoal = inferParallelSharedGoal(input.tasks);
    const verifierLaneIds = input.tasks
        .filter((task) => inferLaneRole(task) === "verifier")
        .map((task) => task.laneId);
    const implementationLaneIds = input.tasks
        .filter((task) => inferLaneRole(task) !== "verifier")
        .map((task) => task.laneId);
    return {
        id: `team_${crypto.randomUUID().slice(0, 8)}`,
        mode,
        sharedGoal,
        ...(input.managerAgentId ? { managerAgentId: input.managerAgentId } : {}),
        memberRoster: input.tasks.map((task) => ({
            laneId: task.laneId,
            ...(task.agentId ? { agentId: task.agentId } : {}),
            ...(inferLaneRole(task) ? { role: inferLaneRole(task) } : {}),
            ...(task.delegationContract.ownership?.scopeSummary
                ? { scopeSummary: task.delegationContract.ownership.scopeSummary }
                : { scopeSummary: summarizeInstruction(task.instruction) }),
            ...(inferLaneRole(task) === "verifier" && implementationLaneIds.length > 0
                ? { dependsOn: implementationLaneIds }
                : {}),
            ...(inferLaneRole(task) !== "verifier" && verifierLaneIds.length > 0
                ? { handoffTo: verifierLaneIds }
                : {}),
        })),
    };
}

function inferParallelTeamMode(input: Array<{ agentId?: string; instruction: string }>): DelegationTeamMode {
    const agentIds = input
        .map((task) => task.agentId?.trim().toLowerCase())
        .filter(Boolean) as string[];

    if (agentIds.length > 0 && agentIds.every((id) => id.includes("verifier"))) {
        return "verify_swarm";
    }
    if (agentIds.length > 0 && agentIds.every((id) => id.includes("research"))) {
        return "research_grid";
    }
    if (agentIds.length > 0 && agentIds.every((id) => id.includes("coder"))) {
        return "parallel_patch";
    }
    return "parallel_subtasks";
}

function inferParallelSharedGoal(
    input: Array<{ instruction: string }>,
): string {
    if (input.length === 1) {
        return summarizeInstruction(input[0]?.instruction ?? "");
    }
    const first = summarizeInstruction(input[0]?.instruction ?? "");
    return `Coordinate ${input.length} delegated lanes and fan the results back into the manager. First lane: ${first}`;
}

function summarizeInstruction(instruction: string): string {
    const normalized = instruction.trim().replace(/\s+/g, " ");
    if (!normalized) {
        return "Execute delegated work.";
    }
    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function inferLaneRole(task: {
    agentId?: string;
    delegationContract: ReturnType<typeof readStructuredDelegationContractArgs>;
}): "coder" | "researcher" | "verifier" | undefined {
    const agentId = task.agentId?.trim().toLowerCase();
    if (agentId?.includes("verifier")) {
        return "verifier";
    }
    if (agentId?.includes("research")) {
        return "researcher";
    }
    if (agentId?.includes("coder")) {
        return "coder";
    }
    if (task.delegationContract.deliverableContract?.format === "verification_report") {
        return "verifier";
    }
    return undefined;
}
