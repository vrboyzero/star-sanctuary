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
                ...DELEGATION_CONTRACT_PARAMETER_PROPERTIES,
            },
            required: ["instruction"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "delegate_task";
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

        if (!context.agentCapabilities?.spawnSubAgent) {
            return makeError(
                "Error: Sub-agent orchestration is not available (capability missing).",
                "Error: Sub-agent orchestration is not available (capability missing).",
                "environment_error",
            );
        }

        const instruction = args.instruction as string;
        if (!instruction?.trim()) {
            return makeError(
                "Error: instruction is required and cannot be empty.",
                "Error: instruction is required and cannot be empty.",
                "input_error",
            );
        }

        try {
            const delegationContract = readStructuredDelegationContractArgs(args as Record<string, unknown>);
            const launchSpec = buildSubAgentLaunchSpec(context, {
                instruction,
                agentId: args.agent_id as string | undefined,
                context: args.context as Record<string, unknown> | undefined,
                channel: "subtask",
                delegationSource: "delegate_task",
                ownership: delegationContract.ownership,
                acceptance: delegationContract.acceptance,
                deliverableContract: delegationContract.deliverableContract,
            });
            const result = await context.agentCapabilities.spawnSubAgent(launchSpec);
            const gate = result.success
                ? evaluateDelegationResultGate({
                    output: result.output,
                    contract: launchSpec.delegationProtocol,
                })
                : undefined;
            const gateReport = gate ? renderDelegationResultGateReport(gate) : undefined;
            const accepted = result.success && (!gate || !gate.enforced || gate.accepted);
            const gateError = gate?.enforced && !gate.accepted
                ? `Delegation acceptance gate rejected the sub-agent result. ${gate.summary}`
                : undefined;

            const output = [
                accepted
                    ? `[delegate_task] Agent "${args.agent_id ?? "default"}" completed successfully.\n\n${result.output}`
                    : gateError
                        ? `[delegate_task] Agent "${args.agent_id ?? "default"}" completed, but the delegated result failed acceptance.\n\n${result.output}`
                        : `[delegate_task] Agent "${args.agent_id ?? "default"}" failed: ${result.error ?? "unknown error"}`,
                gateReport ?? "",
                result.taskId ? `Task ID: ${result.taskId}` : "",
                result.sessionId ? `Session ID: ${result.sessionId}` : "",
                result.outputPath ? `Output Path: ${result.outputPath}` : "",
            ].filter(Boolean).join("\n");

            return {
                id,
                name,
                success: accepted,
                output,
                error: gateError ?? result.error,
                ...(!accepted
                    ? {
                        failureKind: gateError
                            ? "business_logic_error"
                            : (result.error ? "environment_error" : "unknown"),
                    }
                    : {}),
                durationMs: Date.now() - start,
                metadata: buildDelegationResultToolMetadata({
                    delegationResults: [{
                        label: args.agent_id ? `Agent ${String(args.agent_id)}` : "Agent default",
                        workerSuccess: result.success,
                        accepted,
                        error: result.error,
                        taskId: result.taskId,
                        sessionId: result.sessionId,
                        outputPath: result.outputPath,
                        acceptanceGate: gate,
                    }],
                    acceptedCount: accepted ? 1 : 0,
                    gateRejectedCount: result.success && gate?.enforced && !gate.accepted ? 1 : 0,
                    workerSuccessCount: result.success ? 1 : 0,
                    followUpStrategy: buildDelegationResultFollowUpStrategy({
                        toolName: "delegate_task",
                        requestArguments: args as Record<string, unknown>,
                        delegationResults: [{
                            label: args.agent_id ? `Agent ${String(args.agent_id)}` : "Agent default",
                            workerSuccess: result.success,
                            accepted,
                            error: result.error,
                            taskId: result.taskId,
                            sessionId: result.sessionId,
                            outputPath: result.outputPath,
                            acceptanceGate: gate,
                        }],
                    }),
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
    activityDescription: "Delegate a task to a specific sub-agent profile",
    resultSchema: {
        kind: "text",
        description: "Delegated task status and synthesized sub-agent output text.",
    },
    outputPersistencePolicy: "conversation",
});
