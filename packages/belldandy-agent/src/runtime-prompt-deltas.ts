import {
  inferToolFailureKindFromError,
  getToolContractV2,
  type DelegationResultToolMetadata,
  type ToolCallResult,
  type ToolContractV2,
  type ToolFailureKind,
  type ToolRuntimeLaunchSpec,
} from "@belldandy/skills";

import type { AgentPromptDelta } from "./prompt-snapshot.js";

export function buildLaunchSpecPromptDeltas(
  launchSpec?: ToolRuntimeLaunchSpec,
): AgentPromptDelta[] {
  if (!launchSpec) {
    return [];
  }

  const deltas: AgentPromptDelta[] = [];
  const roleDelta = buildLaunchRolePromptDelta(launchSpec);
  if (roleDelta) {
    deltas.push(roleDelta);
  }

  const toolSelectionDelta = buildLaunchToolSelectionPromptDelta(launchSpec);
  if (toolSelectionDelta) {
    deltas.push(toolSelectionDelta);
  }

  return deltas;
}

export function collectSystemPromptDeltaTexts(
  deltas?: readonly AgentPromptDelta[],
): string[] {
  return (deltas ?? [])
    .filter((delta) => delta.role === "system")
    .map((delta) => delta.text.trim())
    .filter(Boolean);
}

export function buildToolResultPromptDeltas(input: {
  result: Pick<ToolCallResult, "id" | "name" | "success" | "error" | "output" | "metadata" | "failureKind">;
  requestArguments?: Record<string, unknown>;
}): AgentPromptDelta[] {
  const contract = getToolContractV2(input.result.name);
  const delegationResultMetadata = readDelegationResultToolMetadataFromUnknown(input.result.metadata);

  if (!input.result.success) {
    const deltas: AgentPromptDelta[] = [];
    const failureDelta = buildToolFailureRecoveryPromptDelta({
      toolCallId: input.result.id,
      toolName: input.result.name,
      error: input.result.error,
      failureKind: input.result.failureKind,
    }, contract, delegationResultMetadata);
    if (failureDelta) {
      deltas.push(failureDelta);
    }
    if (shouldInjectDelegationFailureReview(input.result.name, input.result.error, contract, delegationResultMetadata)) {
      const delegationReviewDelta = buildToolPostVerificationPromptDelta({
        toolCallId: input.result.id,
        toolName: input.result.name,
        requestArguments: input.requestArguments,
        resultMetadata: input.result.metadata,
      }, contract);
      if (delegationReviewDelta) {
        deltas.push(delegationReviewDelta);
      }
    }
    return deltas;
  }

  const postVerificationDelta = buildToolPostVerificationPromptDelta({
    toolCallId: input.result.id,
    toolName: input.result.name,
    requestArguments: input.requestArguments,
    resultMetadata: input.result.metadata,
  }, contract);
  return postVerificationDelta ? [postVerificationDelta] : [];
}

export function buildToolFailureRecoveryPromptDelta(input: {
  toolCallId?: string;
  toolName: string;
  error?: string;
  failureKind?: ToolFailureKind;
}, contract?: ToolContractV2, delegationResultMetadata?: DelegationResultToolMetadata): AgentPromptDelta | undefined {
  const resolvedContract = contract ?? getToolContractV2(input.toolName);
  const failureClass = input.failureKind ?? inferToolFailureKindFromError(input.error);
  const lines = [
    "## Tool Failure Recovery",
    "",
    "The most recent tool call failed. Use that failure as evidence before choosing the next action.",
    `- Failed tool: \`${input.toolName}\``,
    `- Failure class: ${failureClass}`,
  ];

  const errorSummary = summarizeInlineText(input.error, 220);
  if (errorSummary) {
    lines.push(`- Reported error: ${errorSummary}`);
  }
  const fallbackSummary = summarizeCompactList(resolvedContract?.fallbackStrategy, 2);
  if (fallbackSummary) {
    lines.push(`- Contract fallback hints: ${fallbackSummary}`);
  }
  const preflightSummary = summarizeCompactList(resolvedContract?.preflightChecks, 2);
  if (preflightSummary) {
    lines.push(`- Contract preflight checks: ${preflightSummary}`);
  }
  const rejectedDelegation = readPrimaryRejectedDelegationResult(delegationResultMetadata);
  if (rejectedDelegation?.acceptanceGate?.summary) {
    lines.push(`- Delegation gate summary: ${rejectedDelegation.acceptanceGate.summary}`);
  }
  if (rejectedDelegation?.acceptanceGate?.rejectionConfidence) {
    lines.push(`- Delegation gate confidence: ${rejectedDelegation.acceptanceGate.rejectionConfidence}`);
  }
  if (delegationResultMetadata?.followUpStrategy?.summary) {
    lines.push(`- Suggested follow-up: ${delegationResultMetadata.followUpStrategy.summary}`);
  }
  if (delegationResultMetadata?.followUpStrategy?.recommendedRuntimeAction) {
    lines.push(`- Suggested runtime action: ${delegationResultMetadata.followUpStrategy.recommendedRuntimeAction}`);
  }
  const highPriorityFollowUp = summarizeCompactList(delegationResultMetadata?.followUpStrategy?.highPriorityLabels, 3);
  if (highPriorityFollowUp) {
    lines.push(`- High-priority follow-up items: ${highPriorityFollowUp}`);
  }
  const verifierHandoffAvailable = summarizeCompactList(delegationResultMetadata?.followUpStrategy?.verifierHandoffLabels, 3);
  if (verifierHandoffAvailable) {
    lines.push(`- Verifier handoff available for: ${verifierHandoffAvailable}`);
  }

  lines.push(
    "",
    FAILURE_CLASS_GUIDANCE[failureClass],
    "Do not repeat the identical tool call until you can explain what changed in the arguments, permissions, or environment.",
  );

  return {
    id: `tool-failure-recovery-${sanitizeDeltaIdSegment(input.toolCallId ?? input.toolName)}`,
    deltaType: "tool-failure-recovery",
    role: "system",
    source: "tool-result",
    text: lines.join("\n"),
    metadata: {
      toolName: input.toolName,
      failureClass,
      ...(delegationResultMetadata ? { delegationResult: delegationResultMetadata as any } : {}),
    },
  };
}

export function buildToolPostVerificationPromptDelta(input: {
  toolCallId?: string;
  toolName: string;
  requestArguments?: Record<string, unknown>;
  resultMetadata?: unknown;
}, contract?: ToolContractV2): AgentPromptDelta | undefined {
  const resolvedContract = contract ?? getToolContractV2(input.toolName);
  if (!shouldInjectPostVerification(resolvedContract, input.toolName)) {
    return undefined;
  }

  const delegationResultMetadata = readDelegationResultToolMetadataFromUnknown(input.resultMetadata);
  const delegationReviewText = buildDelegationResultReviewText(
    input.toolName,
    input.requestArguments,
    resolvedContract,
    delegationResultMetadata,
  );
  if (delegationReviewText) {
    return {
      id: `tool-post-verification-${sanitizeDeltaIdSegment(input.toolCallId ?? input.toolName)}`,
      deltaType: "tool-post-verification",
      role: "system",
      source: "tool-result",
      text: delegationReviewText,
      metadata: {
        toolName: input.toolName,
        riskLevel: resolvedContract?.riskLevel,
        reviewMode: "delegation-result",
        ...(delegationResultMetadata ? { delegationResult: delegationResultMetadata as any } : {}),
      },
    };
  }

  const lines = [
    "## Tool Post-Action Verification",
    "",
    "The most recent tool call likely changed workspace or runtime state. Verify the effect before claiming success.",
    `- Tool: \`${input.toolName}\``,
  ];

  const expectedOutput = summarizeCompactList(resolvedContract?.expectedOutput, 2);
  if (expectedOutput) {
    lines.push(`- Expected observable outcome: ${expectedOutput}`);
  }
  const sideEffects = summarizeCompactList(resolvedContract?.sideEffectSummary, 2);
  if (sideEffects) {
    lines.push(`- Side effects to verify: ${sideEffects}`);
  }
  if (resolvedContract?.userVisibleRiskNote) {
    lines.push(`- Risk note: ${resolvedContract.userVisibleRiskNote}`);
  }

  lines.push(
    "",
    "Prefer read-back checks after the action: inspect files, diffs, status, tests, or logs before you conclude the task is complete.",
    "If verification is blocked by the current tool policy, state exactly what remains unverified instead of implying certainty.",
  );

  return {
    id: `tool-post-verification-${sanitizeDeltaIdSegment(input.toolCallId ?? input.toolName)}`,
    deltaType: "tool-post-verification",
    role: "system",
    source: "tool-result",
    text: lines.join("\n"),
    metadata: {
      toolName: input.toolName,
      riskLevel: resolvedContract?.riskLevel,
    },
  };
}

function buildLaunchRolePromptDelta(
  launchSpec: ToolRuntimeLaunchSpec,
): AgentPromptDelta | undefined {
  if (!launchSpec.role || launchSpec.role === "default") {
    return undefined;
  }

  const policyText = ROLE_EXECUTION_POLICY_TEXT[launchSpec.role];
  if (!policyText) {
    return undefined;
  }

  return {
    id: `launch-role-${launchSpec.role}`,
    deltaType: "role-execution-policy",
    role: "system",
    source: "launch-spec",
    text: [
      "## Run Role Override",
      "",
      `For this run, operate as \`${launchSpec.role}\`. This run-level role overrides any broader default behavior when they conflict.`,
      "",
      policyText,
    ].join("\n"),
    metadata: {
      role: launchSpec.role,
    },
  };
}

function buildLaunchToolSelectionPromptDelta(
  launchSpec: ToolRuntimeLaunchSpec,
): AgentPromptDelta | undefined {
  const lines: string[] = [];

  if (launchSpec.permissionMode?.trim()) {
    lines.push(`- Permission mode: ${launchSpec.permissionMode.trim()}`);
  }
  if (Array.isArray(launchSpec.allowedToolFamilies) && launchSpec.allowedToolFamilies.length > 0) {
    lines.push(`- Allowed tool families: ${launchSpec.allowedToolFamilies.join(", ")}`);
  }
  if (launchSpec.maxToolRiskLevel?.trim()) {
    lines.push(`- Max tool risk level: ${launchSpec.maxToolRiskLevel.trim()}`);
  }
  const toolSetSummary = summarizeList(launchSpec.toolSet, 8);
  if (toolSetSummary) {
    lines.push(`- Preferred tool set: ${toolSetSummary}`);
  }
  if (launchSpec.policySummary?.trim()) {
    lines.push(`- Policy summary: ${launchSpec.policySummary.trim()}`);
  }
  if (launchSpec.delegationProtocol?.expectedDeliverable) {
    lines.push(
      `- Expected deliverable: ${launchSpec.delegationProtocol.expectedDeliverable.format} | ${launchSpec.delegationProtocol.expectedDeliverable.summary}`,
    );
  }
  if (launchSpec.delegationProtocol?.ownership?.scopeSummary?.trim()) {
    lines.push(`- Owned scope: ${launchSpec.delegationProtocol.ownership.scopeSummary.trim()}`);
  }
  const outOfScopeSummary = summarizeList(launchSpec.delegationProtocol?.ownership?.outOfScope, 4);
  if (outOfScopeSummary) {
    lines.push(`- Out of scope: ${outOfScopeSummary}`);
  }
  const doneDefinition = launchSpec.delegationProtocol?.acceptance?.doneDefinition?.trim();
  if (doneDefinition) {
    lines.push(`- Done definition: ${doneDefinition}`);
  }
  const verificationHints = summarizeList(launchSpec.delegationProtocol?.acceptance?.verificationHints, 4);
  if (verificationHints) {
    lines.push(`- Verification hints: ${verificationHints}`);
  }
  const requiredSections = summarizeList(launchSpec.delegationProtocol?.deliverableContract?.requiredSections, 4);
  if (requiredSections) {
    lines.push(`- Deliverable required sections: ${requiredSections}`);
  }
  const isVerifierHandoff = launchSpec.role === "verifier"
    || launchSpec.delegationProtocol?.intent?.kind === "verifier_handoff"
    || launchSpec.delegationProtocol?.aggregationPolicy?.mode === "verifier_fan_in"
    || launchSpec.delegationProtocol?.expectedDeliverable?.format === "verification_report";
  if (isVerifierHandoff) {
    lines.push(
      "- Verifier handoff rule: stay inside verification scope, preserve inherited verification hints, compare the deliverable against the done definition, and return a verification_report before accepting or fanning in the result.",
    );
    const sourceAgents = summarizeList(launchSpec.delegationProtocol?.aggregationPolicy?.sourceAgentIds, 4);
    if (sourceAgents) {
      lines.push(`- Verifier handoff source agents: ${sourceAgents}`);
    }
  }
  if (launchSpec.channel?.trim()) {
    lines.push(`- Run channel: ${launchSpec.channel.trim()}`);
  }

  if (lines.length === 0) {
    return undefined;
  }

  return {
    id: "launch-tool-selection-policy",
    deltaType: "tool-selection-policy",
    role: "system",
    source: "launch-spec",
    text: [
      "## Run Tool Selection Constraints",
      "",
      "This run carries additional launch-time execution constraints. Stay inside them when selecting tools or deciding whether to proceed.",
      ...lines,
      "",
      "If the task requires actions outside these constraints, stop and report the blocker instead of improvising with adjacent higher-risk tools.",
    ].join("\n"),
    metadata: {
      permissionMode: launchSpec.permissionMode,
      maxToolRiskLevel: launchSpec.maxToolRiskLevel,
      role: launchSpec.role,
    },
  };
}

function summarizeList(values: readonly string[] | undefined, maxItems: number): string | undefined {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean);
  if (normalized.length === 0) {
    return undefined;
  }

  const selected = normalized.slice(0, Math.max(1, maxItems));
  const omittedCount = Math.max(0, normalized.length - selected.length);
  if (omittedCount <= 0) {
    return selected.join(", ");
  }
  return `${selected.join(", ")} (+${omittedCount} more)`;
}

const ROLE_EXECUTION_POLICY_TEXT: Record<"coder" | "researcher" | "verifier", string> = {
  coder: [
    "## Role Execution Policy (coder)",
    "",
    "Inspect the current implementation before editing, keep diffs minimal, and validate touched paths before finishing.",
  ].join("\n"),
  researcher: [
    "## Role Execution Policy (researcher)",
    "",
    "Prioritize reading, searching, and evidence gathering. Keep source-backed findings separate from inference.",
  ].join("\n"),
  verifier: [
    "## Role Execution Policy (verifier)",
    "",
    "Prioritize checks, tests, diffs, and observable evidence. Do not treat implementation intent as proof of correctness.",
  ].join("\n"),
};

const FAILURE_CLASS_GUIDANCE: Record<ToolFailureKind, string> = {
  input_error: "Focus on validating arguments, paths, identifiers, and schema assumptions before retrying. A read-only inspection step is usually safer than repeating the same write path.",
  permission_or_policy: "Do not work around policy or permission failures with adjacent higher-risk tools. Either switch to an allowed lower-risk path or report the blocker clearly.",
  environment_error: "Treat this as an execution-environment problem first. Check availability, runtime state, and prerequisites before deciding whether a retry is justified.",
  business_logic_error: "Inspect the current state with read-only evidence before trying again. Adjust the plan only after you understand why the operation was rejected by the target system.",
  unknown: "Pause and gather more evidence with read-only diagnostics before deciding whether to retry, switch tools, or escalate the blocker.",
};

function shouldInjectPostVerification(contract: ToolContractV2 | undefined, toolName: string): boolean {
  if (contract) {
    return contract.isReadOnly !== true
      || contract.needsPermission === true
      || contract.riskLevel === "high"
      || contract.riskLevel === "critical";
  }

  return /(^|_)(write|delete|patch|edit|apply|update|create|spawn|close|approve|reject|publish|claim|complete|fail|skip|block)(_|$)/i.test(toolName);
}

function buildDelegationResultReviewText(
  toolName: string,
  requestArguments: Record<string, unknown> | undefined,
  contract: ToolContractV2 | undefined,
  delegationResultMetadata?: DelegationResultToolMetadata,
): string | undefined {
  if (!isDelegationTool(contract, toolName)) {
    return undefined;
  }

  const taskContracts = readDelegationTaskContracts(toolName, requestArguments);
  if (taskContracts.length === 0) {
    return [
      "## Delegation Result Review",
      "",
      "The most recent tool call delegated work to one or more sub-agents.",
      "Wait immediately only if your next safe local step is blocked on that result or the result is needed to prove safety/completion.",
      "Reject or follow up if the returned result does not clearly satisfy the delegated scope, completion criteria, or deliverable format.",
    ].join("\n");
  }

  const lines = [
    "## Delegation Result Review",
    "",
    "The most recent tool call delegated work to one or more sub-agents. Review the returned result against the delegation contract before relying on it.",
    "Wait immediately only if your next safe local step is blocked on that result or the result is needed to prove safety/completion.",
    "If the result exceeds owned scope, violates out-of-scope limits, misses required sections, or fails the done definition, reject it or issue a follow-up delegation instead of treating it as complete.",
  ];

  for (const task of taskContracts.slice(0, 3)) {
    const prefix = task.label ? `- ${task.label}:` : "- Delegated task:";
    lines.push(prefix);
    if (task.scopeSummary) {
      lines.push(`  Owned scope: ${task.scopeSummary}`);
    }
    if (task.outOfScope) {
      lines.push(`  Out of scope: ${task.outOfScope}`);
    }
    if (task.doneDefinition) {
      lines.push(`  Done definition: ${task.doneDefinition}`);
    }
    if (task.verificationHints) {
      lines.push(`  Verification hints: ${task.verificationHints}`);
    }
    if (task.deliverable) {
      lines.push(`  Deliverable contract: ${task.deliverable}`);
    }
  }

  const reviewedResults = delegationResultMetadata?.delegationResults ?? [];
  for (const result of reviewedResults.slice(0, 3)) {
    const gate = result.acceptanceGate;
    if (!gate) {
      continue;
    }
    lines.push(result.label ? `- Result gate (${result.label}):` : "- Result gate:");
    lines.push(`  Status: ${gate.accepted ? "accepted" : "rejected"}`);
    if (gate.rejectionConfidence) {
      lines.push(`  Confidence: ${gate.rejectionConfidence}`);
    }
    if (gate.summary) {
      lines.push(`  Summary: ${gate.summary}`);
    }
    const gateReasons = summarizeCompactList(gate.reasons, 3);
    if (gateReasons) {
      lines.push(`  Reasons: ${gateReasons}`);
    }
    if (gate.managerActionHint) {
      lines.push(`  Manager action: ${gate.managerActionHint}`);
    }
  }

  if (taskContracts.length > 3) {
    lines.push(`- ${taskContracts.length - 3} additional delegated task contracts omitted for brevity.`);
  }
  if (reviewedResults.length > 3) {
    lines.push(`- ${reviewedResults.length - 3} additional delegation gate results omitted for brevity.`);
  }

  const followUpStrategy = delegationResultMetadata?.followUpStrategy;
  if (followUpStrategy) {
    lines.push(
      "",
      "## Suggested Follow-Up Strategy",
      "",
      `Summary: ${followUpStrategy.summary}`,
    );
    if (followUpStrategy.recommendedRuntimeAction) {
      lines.push(`- Recommended runtime action: ${followUpStrategy.recommendedRuntimeAction}`);
    }

    const acceptedSummary = summarizeCompactList(followUpStrategy.acceptedLabels, 4);
    if (acceptedSummary) {
      lines.push(`- Accept now: ${acceptedSummary}`);
    }
    const retrySummary = summarizeCompactList(followUpStrategy.retryLabels, 4);
    if (retrySummary) {
      lines.push(`- Retry with follow-up delegation: ${retrySummary}`);
    }
    const blockerSummary = summarizeCompactList(followUpStrategy.blockerLabels, 4);
    if (blockerSummary) {
      lines.push(`- Report blockers: ${blockerSummary}`);
    }
    const highPrioritySummary = summarizeCompactList(followUpStrategy.highPriorityLabels, 4);
    if (highPrioritySummary) {
      lines.push(`- High-priority follow-up: ${highPrioritySummary}`);
    }
    const verifierHandoffSummary = summarizeCompactList(followUpStrategy.verifierHandoffLabels, 4);
    if (verifierHandoffSummary) {
      lines.push(`- Verifier handoff available: ${verifierHandoffSummary}`);
    }

    for (const item of followUpStrategy.items.slice(0, 3)) {
      lines.push(`- ${item.label}: ${item.action}`);
      lines.push(`  Reason: ${item.reason}`);
      if (item.recommendedRuntimeAction) {
        const runtimeActionSuffix = item.priority ? ` [${item.priority}]` : "";
        lines.push(`  Runtime action: ${item.recommendedRuntimeAction}${runtimeActionSuffix}`);
      }
      const templateSummary = summarizeFollowUpTemplate(item.template);
      if (templateSummary) {
        lines.push(`  Follow-up delegation: ${templateSummary}`);
      }
      const verifierTemplateSummary = summarizeVerifierHandoffTemplate(item);
      if (verifierTemplateSummary) {
        lines.push(`  Optional verifier handoff: ${verifierTemplateSummary}`);
      }
    }

    if (followUpStrategy.items.length > 3) {
      lines.push(`- ${followUpStrategy.items.length - 3} additional follow-up items omitted for brevity.`);
    }
  }

  return lines.join("\n");
}

function shouldInjectDelegationFailureReview(
  toolName: string,
  error: string | undefined,
  contract: ToolContractV2 | undefined,
  delegationResultMetadata?: DelegationResultToolMetadata,
): boolean {
  if (!isDelegationTool(contract, toolName)) {
    return false;
  }
  if (delegationResultMetadata?.delegationResults.some((result) => result.acceptanceGate?.enforced && !result.acceptanceGate.accepted)) {
    return true;
  }
  return /delegation acceptance gate/ui.test(error ?? "");
}

function readPrimaryRejectedDelegationResult(
  metadata: DelegationResultToolMetadata | undefined,
): DelegationResultToolMetadata["delegationResults"][number] | undefined {
  if (!metadata?.delegationResults?.length) {
    return undefined;
  }
  return metadata.delegationResults.find((result) => result.acceptanceGate?.enforced && !result.acceptanceGate.accepted)
    ?? metadata.delegationResults[0];
}

function summarizeCompactList(values: readonly string[] | undefined, maxItems: number): string | undefined {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  const selected = values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, maxItems));
  if (selected.length === 0) {
    return undefined;
  }
  return selected.join(" | ");
}

function readDelegationTaskContracts(
  toolName: string,
  requestArguments: Record<string, unknown> | undefined,
): DelegationTaskReviewContract[] {
  if (!requestArguments || typeof requestArguments !== "object") {
    return [];
  }

  if (toolName === "delegate_parallel") {
    const tasks = Array.isArray(requestArguments.tasks) ? requestArguments.tasks : [];
    return tasks
      .map((task, index) => readDelegationTaskReviewContract(task, `Task ${index + 1}`))
      .filter((task): task is DelegationTaskReviewContract => Boolean(task));
  }

  const single = readDelegationTaskReviewContract(requestArguments, "Delegated task");
  return single ? [single] : [];
}

function readDelegationTaskReviewContract(
  value: unknown,
  label: string,
): DelegationTaskReviewContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const ownership = readDelegationOwnership(record.ownership);
  const acceptance = readDelegationAcceptance(record.acceptance);
  const deliverable = readDelegationDeliverableContract(record.deliverable_contract);
  if (!ownership && !acceptance && !deliverable) {
    return undefined;
  }

  return {
    label,
    scopeSummary: ownership?.scopeSummary,
    outOfScope: summarizeCompactList(ownership?.outOfScope, 3),
    doneDefinition: acceptance?.doneDefinition,
    verificationHints: summarizeCompactList(acceptance?.verificationHints, 3),
    deliverable: summarizeDelegationDeliverableContract(deliverable),
  };
}

function readDelegationOwnership(value: unknown): {
  scopeSummary?: string;
  outOfScope?: string[];
} | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const scopeSummary = normalizeInlineString(record.scope_summary);
  const outOfScope = normalizeStringList(record.out_of_scope);
  if (!scopeSummary && !outOfScope) {
    return undefined;
  }
  return {
    ...(scopeSummary ? { scopeSummary } : {}),
    ...(outOfScope ? { outOfScope } : {}),
  };
}

function readDelegationAcceptance(value: unknown): {
  doneDefinition?: string;
  verificationHints?: string[];
} | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const doneDefinition = normalizeInlineString(record.done_definition);
  const verificationHints = normalizeStringList(record.verification_hints);
  if (!doneDefinition && !verificationHints) {
    return undefined;
  }
  return {
    ...(doneDefinition ? { doneDefinition } : {}),
    ...(verificationHints ? { verificationHints } : {}),
  };
}

function readDelegationDeliverableContract(value: unknown): {
  format?: string;
  summary?: string;
  requiredSections?: string[];
} | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const format = normalizeInlineString(record.format);
  const summary = normalizeInlineString(record.summary);
  const requiredSections = normalizeStringList(record.required_sections);
  if (!format && !summary && !requiredSections) {
    return undefined;
  }
  return {
    ...(format ? { format } : {}),
    ...(summary ? { summary } : {}),
    ...(requiredSections ? { requiredSections } : {}),
  };
}

function summarizeDelegationDeliverableContract(value: {
  format?: string;
  summary?: string;
  requiredSections?: string[];
} | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const parts: string[] = [];
  if (value.format) {
    parts.push(value.format);
  }
  if (value.summary) {
    parts.push(value.summary);
  }
  const requiredSections = summarizeCompactList(value.requiredSections, 4);
  if (requiredSections) {
    parts.push(`sections: ${requiredSections}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function normalizeInlineString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function readDelegationResultToolMetadataFromUnknown(value: unknown): DelegationResultToolMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const delegationResults = Array.isArray(record.delegationResults)
    ? record.delegationResults
        .map((entry) => readDelegationResultToolReview(entry))
        .filter((entry): entry is DelegationResultToolMetadata["delegationResults"][number] => Boolean(entry))
    : [];
  if (delegationResults.length === 0) {
    return undefined;
  }

  const acceptedCount = normalizeOptionalNumber(record.acceptedCount);
  const gateRejectedCount = normalizeOptionalNumber(record.gateRejectedCount);
  const workerSuccessCount = normalizeOptionalNumber(record.workerSuccessCount);
  const followUpStrategy = readDelegationResultFollowUpStrategy(record.followUpStrategy);

  return {
    delegationResults,
    ...(typeof acceptedCount === "number" ? { acceptedCount } : {}),
    ...(typeof gateRejectedCount === "number" ? { gateRejectedCount } : {}),
    ...(typeof workerSuccessCount === "number" ? { workerSuccessCount } : {}),
    ...(followUpStrategy ? { followUpStrategy } : {}),
  };
}

function readDelegationResultToolReview(
  value: unknown,
): DelegationResultToolMetadata["delegationResults"][number] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.workerSuccess !== "boolean" || typeof record.accepted !== "boolean") {
    return undefined;
  }

  const label = normalizeInlineString(record.label);
  const taskId = normalizeInlineString(record.taskId);
  const sessionId = normalizeInlineString(record.sessionId);
  const outputPath = normalizeInlineString(record.outputPath);
  const acceptanceGate = readDelegationResultGate(record.acceptanceGate);

  return {
    workerSuccess: record.workerSuccess,
    accepted: record.accepted,
    ...(normalizeInlineString(record.error) ? { error: normalizeInlineString(record.error) } : {}),
    ...(label ? { label } : {}),
    ...(taskId ? { taskId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(outputPath ? { outputPath } : {}),
    ...(acceptanceGate ? { acceptanceGate } : {}),
  };
}

function readDelegationResultGate(
  value: unknown,
): NonNullable<DelegationResultToolMetadata["delegationResults"][number]["acceptanceGate"]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.enforced !== "boolean" || typeof record.accepted !== "boolean" || typeof record.summary !== "string") {
    return undefined;
  }

  const reasons = normalizeStringList(record.reasons) ?? [];
  const deliverableFormat = normalizeInlineString(record.deliverableFormat) as NonNullable<
    NonNullable<DelegationResultToolMetadata["delegationResults"][number]["acceptanceGate"]>["deliverableFormat"]
  > | undefined;
  const requiredSections = normalizeStringList(record.requiredSections);
  const missingRequiredSections = normalizeStringList(record.missingRequiredSections);
  const doneDefinition = normalizeInlineString(record.doneDefinition);
  const acceptanceCheckStatus = readAcceptanceCheckStatus(record.acceptanceCheckStatus);
  const acceptanceCheckEvidence = normalizeInlineString(record.acceptanceCheckEvidence);
  const verificationHints = normalizeStringList(record.verificationHints);
  const contractSpecificChecks = Array.isArray(record.contractSpecificChecks)
    ? record.contractSpecificChecks
        .map((entry) => readDelegationResultGateContractCheck(entry))
        .filter((entry): entry is NonNullable<
          NonNullable<DelegationResultToolMetadata["delegationResults"][number]["acceptanceGate"]>["contractSpecificChecks"]
        >[number] => Boolean(entry))
    : [];
  const rejectionConfidence = readRejectionConfidence(record.rejectionConfidence);
  const managerActionHint = normalizeInlineString(record.managerActionHint);

  return {
    enforced: record.enforced,
    accepted: record.accepted,
    summary: record.summary.trim(),
    reasons,
    ...(deliverableFormat ? { deliverableFormat } : {}),
    ...(requiredSections ? { requiredSections } : {}),
    ...(missingRequiredSections ? { missingRequiredSections } : {}),
    ...(doneDefinition ? { doneDefinition } : {}),
    acceptanceCheckStatus,
    ...(acceptanceCheckEvidence ? { acceptanceCheckEvidence } : {}),
    ...(verificationHints ? { verificationHints } : {}),
    ...(contractSpecificChecks.length > 0 ? { contractSpecificChecks } : {}),
    ...(rejectionConfidence ? { rejectionConfidence } : {}),
    ...(managerActionHint ? { managerActionHint } : {}),
  };
}

function readDelegationResultGateContractCheck(
  value: unknown,
): NonNullable<
  NonNullable<DelegationResultToolMetadata["delegationResults"][number]["acceptanceGate"]>["contractSpecificChecks"]
>[number] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.label !== "string" || typeof record.enforced !== "boolean") {
    return undefined;
  }

  const status = readContractCheckStatus(record.status);
  if (!status) {
    return undefined;
  }

  const evidence = normalizeInlineString(record.evidence);
  return {
    id: record.id.trim(),
    label: record.label.trim(),
    status,
    enforced: record.enforced,
    ...(evidence ? { evidence } : {}),
  };
}

function readDelegationResultFollowUpStrategy(
  value: unknown,
): DelegationResultToolMetadata["followUpStrategy"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const mode = record.mode === "single" || record.mode === "parallel" ? record.mode : undefined;
  const summary = normalizeInlineString(record.summary);
  const items = Array.isArray(record.items)
    ? record.items
        .map((entry) => readDelegationResultFollowUpItem(entry))
        .filter((entry): entry is NonNullable<DelegationResultToolMetadata["followUpStrategy"]>["items"][number] => Boolean(entry))
    : [];
  if (!mode || !summary || items.length === 0) {
    return undefined;
  }

  const acceptedLabels = normalizeStringList(record.acceptedLabels);
  const retryLabels = normalizeStringList(record.retryLabels);
  const blockerLabels = normalizeStringList(record.blockerLabels);
  const highPriorityLabels = normalizeStringList(record.highPriorityLabels);
  const verifierHandoffLabels = normalizeStringList(record.verifierHandoffLabels);
  const recommendedRuntimeAction = readDelegationResultRuntimeAction(record.recommendedRuntimeAction);
  return {
    mode,
    summary,
    items,
    ...(recommendedRuntimeAction ? { recommendedRuntimeAction } : {}),
    ...(acceptedLabels ? { acceptedLabels } : {}),
    ...(retryLabels ? { retryLabels } : {}),
    ...(blockerLabels ? { blockerLabels } : {}),
    ...(highPriorityLabels ? { highPriorityLabels } : {}),
    ...(verifierHandoffLabels ? { verifierHandoffLabels } : {}),
  };
}

function readDelegationResultFollowUpItem(
  value: unknown,
): NonNullable<DelegationResultToolMetadata["followUpStrategy"]>["items"][number] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const label = normalizeInlineString(record.label);
  const action = readDelegationResultFollowUpAction(record.action);
  const reason = normalizeInlineString(record.reason);
  if (!label || !action || !reason) {
    return undefined;
  }

  const verificationHints = normalizeStringList(record.verificationHints);
  const template = readDelegationResultFollowUpTemplate(record.template);
  const verifierTemplate = readDelegationResultFollowUpTemplate(record.verifierTemplate);
  const recommendedRuntimeAction = readDelegationResultRuntimeAction(record.recommendedRuntimeAction);
  const priority = readDelegationResultRuntimeActionPriority(record.priority);
  return {
    label,
    action,
    reason,
    ...(recommendedRuntimeAction ? { recommendedRuntimeAction } : {}),
    ...(priority ? { priority } : {}),
    ...(verificationHints ? { verificationHints } : {}),
    ...(template ? { template } : {}),
    ...(verifierTemplate ? { verifierTemplate } : {}),
  };
}

function readDelegationResultFollowUpTemplate(
  value: unknown,
): NonNullable<NonNullable<DelegationResultToolMetadata["followUpStrategy"]>["items"][number]["template"]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const toolName = record.toolName === "delegate_task" ? record.toolName : undefined;
  const instruction = normalizeInlineString(record.instruction);
  if (!toolName || !instruction) {
    return undefined;
  }

  const agentId = normalizeInlineString(record.agentId);
  const acceptance = readDelegationFollowUpTemplateAcceptance(record.acceptance);
  const deliverableContract = readDelegationFollowUpTemplateDeliverableContract(record.deliverableContract);
  return {
    toolName,
    instruction,
    ...(agentId ? { agentId } : {}),
    ...(acceptance ? { acceptance } : {}),
    ...(deliverableContract ? { deliverableContract } : {}),
  };
}

function readDelegationFollowUpTemplateAcceptance(
  value: unknown,
): NonNullable<NonNullable<NonNullable<DelegationResultToolMetadata["followUpStrategy"]>["items"][number]["template"]>["acceptance"]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const doneDefinition = normalizeInlineString(record.doneDefinition);
  const verificationHints = normalizeStringList(record.verificationHints);
  if (!doneDefinition && !verificationHints) {
    return undefined;
  }
  return {
    ...(doneDefinition ? { doneDefinition } : {}),
    ...(verificationHints ? { verificationHints } : {}),
  };
}

function readDelegationFollowUpTemplateDeliverableContract(
  value: unknown,
): NonNullable<NonNullable<NonNullable<DelegationResultToolMetadata["followUpStrategy"]>["items"][number]["template"]>["deliverableContract"]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const format = normalizeInlineString(record.format) as NonNullable<
    NonNullable<NonNullable<NonNullable<DelegationResultToolMetadata["followUpStrategy"]>["items"][number]["template"]>["deliverableContract"]>["format"]
  > | undefined;
  const summary = normalizeInlineString(record.summary);
  const requiredSections = normalizeStringList(record.requiredSections);
  if (!format && !summary && !requiredSections) {
    return undefined;
  }
  return {
    ...(format ? { format } : {}),
    ...(summary ? { summary } : {}),
    ...(requiredSections ? { requiredSections } : {}),
  };
}

function readAcceptanceCheckStatus(
  value: unknown,
): NonNullable<DelegationResultToolMetadata["delegationResults"][number]["acceptanceGate"]>["acceptanceCheckStatus"] {
  return value === "passed"
    || value === "missing"
    || value === "failed"
    || value === "unclear"
    || value === "not_requested"
    ? value
    : "not_requested";
}

function readContractCheckStatus(value: unknown): "passed" | "failed" | undefined {
  return value === "passed" || value === "failed" ? value : undefined;
}

function readRejectionConfidence(value: unknown): "low" | "medium" | "high" | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function readDelegationResultFollowUpAction(value: unknown): "accept" | "retry" | "report_blocker" | undefined {
  return value === "accept" || value === "retry" || value === "report_blocker" ? value : undefined;
}

function readDelegationResultRuntimeAction(
  value: unknown,
): "accept_result" | "retry_delegation" | "handoff_to_verifier" | "report_blocker" | undefined {
  return value === "accept_result"
    || value === "retry_delegation"
    || value === "handoff_to_verifier"
    || value === "report_blocker"
    ? value
    : undefined;
}

function readDelegationResultRuntimeActionPriority(value: unknown): "normal" | "high" | undefined {
  return value === "normal" || value === "high" ? value : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function isDelegationTool(contract: ToolContractV2 | undefined, toolName: string): boolean {
  if (contract?.family === "session-orchestration") {
    return true;
  }
  return toolName === "delegate_task" || toolName === "delegate_parallel" || toolName === "sessions_spawn";
}

type DelegationTaskReviewContract = {
  label: string;
  scopeSummary?: string;
  outOfScope?: string;
  doneDefinition?: string;
  verificationHints?: string;
  deliverable?: string;
};

function summarizeInlineText(value?: string, maxLength: number = 200): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function summarizeFollowUpTemplate(
  template: NonNullable<NonNullable<DelegationResultToolMetadata["followUpStrategy"]>["items"][number]["template"]> | undefined,
): string | undefined {
  if (!template) {
    return undefined;
  }
  const parts = [
    template.toolName,
    template.agentId ? `agent_id=${template.agentId}` : undefined,
    template.instruction ? `instruction=${summarizeInlineText(template.instruction, 120)}` : undefined,
    template.deliverableContract?.format ? `deliverable_format=${template.deliverableContract.format}` : undefined,
    template.deliverableContract?.requiredSections?.length
      ? `required_sections=${template.deliverableContract.requiredSections.join(" | ")}`
      : undefined,
    template.acceptance?.verificationHints?.length
      ? `verification_hints=${template.acceptance.verificationHints.join(" | ")}`
      : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : undefined;
}

function summarizeVerifierHandoffTemplate(
  item: NonNullable<NonNullable<DelegationResultToolMetadata["followUpStrategy"]>["items"][number]>,
): string | undefined {
  const explicitSummary = summarizeFollowUpTemplate(item.verifierTemplate);
  if (explicitSummary) {
    return explicitSummary;
  }
  if (item.action !== "retry" || !item.template?.acceptance?.verificationHints?.length) {
    return undefined;
  }
  const requiredSections = item.template.deliverableContract?.requiredSections?.length
    ? item.template.deliverableContract.requiredSections
    : ["Findings", "Recommendation"];
  const instruction = `Verify ${item.label} and decide whether the delegated result is safe to accept.`;
  return [
    "delegate_task",
    "agent_id=verifier",
    `instruction=${instruction}`,
    "deliverable_format=verification_report",
    `required_sections=${requiredSections.join(" | ")}`,
    `verification_hints=${item.template.acceptance.verificationHints.join(" | ")}`,
  ].join("; ");
}

function sanitizeDeltaIdSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
