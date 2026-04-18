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
                ...DELEGATION_CONTRACT_PARAMETER_PROPERTIES,
            },
            required: ["instruction"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "sessions_spawn";
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
                "Error: Host agent does not support spawning sub-agents (capability missing).",
                "Error: Host agent does not support spawning sub-agents (capability missing).",
                "environment_error",
            );
        }

        try {
            const delegationContract = readStructuredDelegationContractArgs(args as Record<string, unknown>);
            const launchSpec = buildSubAgentLaunchSpec(context, {
                instruction: args.instruction as string,
                agentId: args.agent_id as string | undefined,
                context: args.context as Record<string, unknown> | undefined,
                channel: "subtask",
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
            const taskDetails = [
                result.taskId ? `Task ID: ${result.taskId}` : "",
                result.sessionId ? `Session ID: ${result.sessionId}` : "",
                result.outputPath ? `Output Path: ${result.outputPath}` : "",
            ].filter(Boolean).join("\n");

            return {
                id,
                name,
                success: accepted,
                output: [
                    gateError ?? "",
                    result.output || (accepted ? "Sub-agent finished successfully." : "Sub-agent failed."),
                    gateReport ?? "",
                    taskDetails,
                ].filter(Boolean).join("\n\n"),
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
                        toolName: "sessions_spawn",
                        requestArguments: args as Record<string, unknown>,
                        delegationResults: [{
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
    activityDescription: "Spawn a sub-agent session to work on an independent task",
    resultSchema: {
        kind: "text",
        description: "Sub-agent completion summary text.",
    },
    outputPersistencePolicy: "conversation",
});
