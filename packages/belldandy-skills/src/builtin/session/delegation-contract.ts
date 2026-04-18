import type { JsonObject } from "../../types.js";
import type {
  DelegationAcceptance,
  DelegationDeliverableContract,
  DelegationDeliverableFormat,
  DelegationOwnership,
} from "../../delegation-protocol.js";

export const DELEGATION_CONTRACT_PARAMETER_PROPERTIES = {
  ownership: {
    type: "object",
    description: "Optional ownership boundary for the delegated task.",
    properties: {
      scope_summary: {
        type: "string",
        description: "What this worker owns and is expected to cover.",
      },
      out_of_scope: {
        type: "array",
        description: "Explicitly forbidden scope expansions for this worker.",
        items: { type: "string" },
      },
      write_scope: {
        type: "array",
        description: "Optional write ownership boundary, such as specific files or directories.",
        items: { type: "string" },
      },
    },
  },
  acceptance: {
    type: "object",
    description: "Optional acceptance criteria for deciding whether the delegated result is good enough.",
    properties: {
      done_definition: {
        type: "string",
        description: "Concrete done definition the worker result must satisfy.",
      },
      verification_hints: {
        type: "array",
        description: "Specific checks the manager should expect or run before accepting the result.",
        items: { type: "string" },
      },
    },
  },
  deliverable_contract: {
    type: "object",
    description: "Optional contract describing the expected handoff format.",
    properties: {
      format: {
        type: "string",
        enum: ["summary", "patch", "research_notes", "verification_report"],
        description: "Expected deliverable format.",
      },
      summary: {
        type: "string",
        description: "Short description of the required handoff.",
      },
      required_sections: {
        type: "array",
        description: "Sections that must appear in the delegated result.",
        items: { type: "string" },
      },
    },
  },
} as const;

const ACCEPTANCE_CHECK_SECTION_LABELS = [
  "Done Definition Check",
  "Acceptance Check",
  "Completion Check",
  "Completion Status",
  "Done Definition Status",
] as const;

const VERIFICATION_REPORT_FINDINGS_SECTION_LABELS = [
  "Findings",
  "Issues",
  "Risks",
  "Observations",
] as const;

const VERIFICATION_REPORT_RECOMMENDATION_SECTION_LABELS = [
  "Recommendation",
  "Recommendations",
  "Decision",
  "Verdict",
  "Conclusion",
  "Merge recommendation",
] as const;

export type DelegationResultGateContractCheck = {
  id: string;
  label: string;
  status: "passed" | "failed";
  enforced: boolean;
  evidence?: string;
};

export type DelegationResultGate = {
  enforced: boolean;
  accepted: boolean;
  summary: string;
  reasons: string[];
  deliverableFormat?: DelegationDeliverableFormat;
  requiredSections?: string[];
  missingRequiredSections?: string[];
  doneDefinition?: string;
  acceptanceCheckStatus: "not_requested" | "passed" | "missing" | "failed" | "unclear";
  acceptanceCheckEvidence?: string;
  verificationHints?: string[];
  contractSpecificChecks?: DelegationResultGateContractCheck[];
  rejectionConfidence?: "low" | "medium" | "high";
  managerActionHint?: string;
};

export type DelegationAcceptanceGateContract = {
  acceptance?: Partial<DelegationAcceptance>;
  deliverableContract?: Partial<DelegationDeliverableContract>;
};

export type DelegationResultToolReview = {
  label?: string;
  workerSuccess: boolean;
  accepted: boolean;
  error?: string;
  taskId?: string;
  sessionId?: string;
  outputPath?: string;
  acceptanceGate?: DelegationResultGate;
};

export type DelegationResultFollowUpAction =
  | "accept"
  | "retry"
  | "report_blocker";

export type DelegationResultRuntimeAction =
  | "accept_result"
  | "retry_delegation"
  | "handoff_to_verifier"
  | "report_blocker";

export type DelegationResultRuntimeActionPriority = "normal" | "high";

export type DelegationResultFollowUpTemplate = {
  toolName: "delegate_task";
  agentId?: string;
  instruction: string;
  context?: JsonObject;
  ownership?: Partial<DelegationOwnership>;
  acceptance?: Partial<DelegationAcceptance>;
  deliverableContract?: Partial<DelegationDeliverableContract>;
};

export type DelegationResultFollowUpItem = {
  label: string;
  action: DelegationResultFollowUpAction;
  reason: string;
  recommendedRuntimeAction?: DelegationResultRuntimeAction;
  priority?: DelegationResultRuntimeActionPriority;
  verificationHints?: string[];
  template?: DelegationResultFollowUpTemplate;
  verifierTemplate?: DelegationResultFollowUpTemplate;
};

export type DelegationResultFollowUpStrategy = {
  mode: "single" | "parallel";
  summary: string;
  items: DelegationResultFollowUpItem[];
  recommendedRuntimeAction?: DelegationResultRuntimeAction;
  acceptedLabels?: string[];
  retryLabels?: string[];
  blockerLabels?: string[];
  highPriorityLabels?: string[];
  verifierHandoffLabels?: string[];
};

export type DelegationResultToolMetadata = {
  delegationResults: DelegationResultToolReview[];
  acceptedCount?: number;
  gateRejectedCount?: number;
  workerSuccessCount?: number;
  followUpStrategy?: DelegationResultFollowUpStrategy;
};

export function readStructuredDelegationContractArgs(args: Record<string, unknown>): {
  ownership?: Partial<DelegationOwnership>;
  acceptance?: Partial<DelegationAcceptance>;
  deliverableContract?: Partial<DelegationDeliverableContract>;
} {
  return {
    ownership: readDelegationOwnershipArgs(args.ownership),
    acceptance: readDelegationAcceptanceArgs(args.acceptance),
    deliverableContract: readDelegationDeliverableContractArgs(args.deliverable_contract),
  };
}

export function evaluateDelegationResultGate(input: {
  output: string;
  contract?: DelegationAcceptanceGateContract;
}): DelegationResultGate {
  const deliverableFormat = input.contract?.deliverableContract?.format;
  const requiredSections = input.contract?.deliverableContract?.requiredSections;
  const doneDefinition = input.contract?.acceptance?.doneDefinition?.trim() || undefined;
  const verificationHints = input.contract?.acceptance?.verificationHints;
  const missingRequiredSections = findMissingRequiredSections(input.output, requiredSections);
  const contractSpecificChecks = evaluateContractSpecificChecks(input.output, deliverableFormat);
  const acceptanceCheckEvidence = doneDefinition
    ? extractAcceptanceCheckEvidence(input.output)
    : undefined;
  const acceptanceCheckStatus = doneDefinition
    ? classifyAcceptanceCheck(acceptanceCheckEvidence)
    : "not_requested";
  const reasons: string[] = [];

  if (!input.output.trim()) {
    reasons.push("Delegated result is empty.");
  }
  if (missingRequiredSections && missingRequiredSections.length > 0) {
    reasons.push(`Missing required sections: ${missingRequiredSections.join(", ")}`);
  }
  for (const check of contractSpecificChecks) {
    if (check.enforced && check.status === "failed") {
      reasons.push(check.label);
    }
  }
  if (doneDefinition) {
    if (acceptanceCheckStatus === "missing") {
      reasons.push("Missing explicit `Done Definition Check` section or verdict.");
    } else if (acceptanceCheckStatus === "failed") {
      reasons.push("The delegated result explicitly says the done definition is not satisfied.");
    } else if (acceptanceCheckStatus === "unclear") {
      reasons.push("The delegated result does not provide a clear pass/fail verdict for the done definition.");
    }
  }

  const enforced = Boolean(
    (requiredSections && requiredSections.length > 0)
    || doneDefinition
    || (verificationHints && verificationHints.length > 0)
    || contractSpecificChecks.some((check) => check.enforced),
  );
  const accepted = enforced ? reasons.length === 0 : true;
  const summary = accepted
    ? "Delegated result passed the structured acceptance gate."
    : `Delegated result failed the structured acceptance gate: ${reasons.join(" | ")}`;
  const rejectionConfidence = accepted
    ? undefined
    : classifyGateRejectionConfidence({
        missingRequiredSections,
        acceptanceCheckStatus,
        contractSpecificChecks,
      });
  const managerActionHint = buildGateManagerActionHint({
    accepted,
    missingRequiredSections,
    acceptanceCheckStatus,
    contractSpecificChecks,
  });

  return {
    enforced,
    accepted,
    summary,
    reasons,
    ...(deliverableFormat ? { deliverableFormat } : {}),
    ...(requiredSections && requiredSections.length > 0 ? { requiredSections: [...requiredSections] } : {}),
    ...(missingRequiredSections && missingRequiredSections.length > 0 ? { missingRequiredSections } : {}),
    ...(doneDefinition ? { doneDefinition } : {}),
    acceptanceCheckStatus,
    ...(acceptanceCheckEvidence ? { acceptanceCheckEvidence } : {}),
    ...(verificationHints && verificationHints.length > 0 ? { verificationHints: [...verificationHints] } : {}),
    ...(contractSpecificChecks.length > 0 ? { contractSpecificChecks } : {}),
    ...(rejectionConfidence ? { rejectionConfidence } : {}),
    ...(managerActionHint ? { managerActionHint } : {}),
  };
}

export function renderDelegationResultGateReport(gate: DelegationResultGate): string | undefined {
  if (!gate.enforced) {
    return undefined;
  }

  const lines = [
    "## Delegation Acceptance Gate",
    "",
    `Status: ${gate.accepted ? "ACCEPTED" : "REJECTED"}`,
    `Summary: ${gate.summary}`,
  ];

  if (gate.deliverableFormat) {
    lines.push(`Deliverable format: ${gate.deliverableFormat}`);
  }
  if (gate.requiredSections && gate.requiredSections.length > 0) {
    lines.push(`Required sections: ${gate.requiredSections.join(" | ")}`);
  }
  if (gate.missingRequiredSections && gate.missingRequiredSections.length > 0) {
    lines.push(`Missing required sections: ${gate.missingRequiredSections.join(" | ")}`);
  }
  if (gate.doneDefinition) {
    lines.push(`Done definition: ${gate.doneDefinition}`);
    lines.push(`Done definition check: ${gate.acceptanceCheckStatus.toUpperCase()}`);
  }
  if (gate.acceptanceCheckEvidence) {
    lines.push(`Acceptance evidence: ${gate.acceptanceCheckEvidence}`);
  }
  if (gate.verificationHints && gate.verificationHints.length > 0) {
    lines.push(`Verification hints: ${gate.verificationHints.join(" | ")}`);
  }
  if (gate.contractSpecificChecks && gate.contractSpecificChecks.length > 0) {
    lines.push(`Contract checks: ${gate.contractSpecificChecks.map((check) => `${check.id}=${check.status.toUpperCase()}`).join(" | ")}`);
  }
  if (gate.reasons.length > 0) {
    lines.push(`Gate reasons: ${gate.reasons.join(" | ")}`);
  }
  if (gate.rejectionConfidence) {
    lines.push(`Rejection confidence: ${gate.rejectionConfidence.toUpperCase()}`);
  }
  lines.push(`Manager action: ${gate.managerActionHint ?? (
    gate.accepted
      ? "the delegated result is structured enough to integrate or verify further."
      : "do not integrate this result as complete. Follow up, reject, or hand off to a verifier."
  )}`);

  return lines.join("\n");
}

export function cloneDelegationResultGate(gate: DelegationResultGate | undefined): DelegationResultGate | undefined {
  if (!gate) {
    return undefined;
  }
  return {
    ...gate,
    reasons: [...gate.reasons],
    ...(gate.requiredSections ? { requiredSections: [...gate.requiredSections] } : {}),
    ...(gate.missingRequiredSections ? { missingRequiredSections: [...gate.missingRequiredSections] } : {}),
    ...(gate.verificationHints ? { verificationHints: [...gate.verificationHints] } : {}),
    ...(gate.contractSpecificChecks
      ? {
          contractSpecificChecks: gate.contractSpecificChecks.map((check) => ({
            ...check,
            ...(check.evidence ? { evidence: check.evidence } : {}),
          })),
        }
      : {}),
  };
}

export function buildDelegationResultToolMetadata(input: {
  delegationResults: DelegationResultToolReview[];
  acceptedCount?: number;
  gateRejectedCount?: number;
  workerSuccessCount?: number;
  followUpStrategy?: DelegationResultFollowUpStrategy;
}): JsonObject | undefined {
  const delegationResults = input.delegationResults
    .map((entry) => cloneDelegationResultToolReview(entry))
    .filter((entry): entry is DelegationResultToolReview => Boolean(entry));
  if (delegationResults.length === 0) {
    return undefined;
  }
  return {
    delegationResults,
    ...(typeof input.acceptedCount === "number" ? { acceptedCount: input.acceptedCount } : {}),
    ...(typeof input.gateRejectedCount === "number" ? { gateRejectedCount: input.gateRejectedCount } : {}),
    ...(typeof input.workerSuccessCount === "number" ? { workerSuccessCount: input.workerSuccessCount } : {}),
    ...(input.followUpStrategy ? { followUpStrategy: cloneDelegationResultFollowUpStrategy(input.followUpStrategy) } : {}),
  } satisfies JsonObject;
}

export function readDelegationResultToolMetadata(value: unknown): DelegationResultToolMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const delegationResults = Array.isArray(record.delegationResults)
    ? record.delegationResults
        .map((entry) => readDelegationResultToolReview(entry))
        .filter((entry): entry is DelegationResultToolReview => Boolean(entry))
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

export function buildDelegationResultFollowUpStrategy(input: {
  toolName: "sessions_spawn" | "delegate_task" | "delegate_parallel";
  requestArguments: Record<string, unknown>;
  delegationResults: DelegationResultToolReview[];
}): DelegationResultFollowUpStrategy | undefined {
  const taskTemplates = readDelegationTaskTemplates(input.toolName, input.requestArguments);
  const itemCount = Math.max(taskTemplates.length, input.delegationResults.length);
  if (itemCount <= 0) {
    return undefined;
  }

  const items: DelegationResultFollowUpItem[] = [];
  const acceptedLabels: string[] = [];
  const retryLabels: string[] = [];
  const blockerLabels: string[] = [];
  const highPriorityLabels: string[] = [];
  const verifierHandoffLabels: string[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const task = taskTemplates[index];
    const result = input.delegationResults[index];
    if (!task && !result) {
      continue;
    }

    const label = result?.label ?? task?.label ?? `Task ${index + 1}`;
    const verificationHints = task?.acceptance?.verificationHints;
    const verifierTemplate = task && verificationHints?.length
      ? buildDelegationVerifierTemplate(task, result)
      : undefined;
    if (verifierTemplate) {
      verifierHandoffLabels.push(label);
    }
    if (result?.accepted) {
      acceptedLabels.push(label);
      items.push({
        label,
        action: "accept",
        reason: result.acceptanceGate?.summary ?? "Delegated result passed the acceptance gate.",
        recommendedRuntimeAction: "accept_result",
        priority: "normal",
        ...(verificationHints && verificationHints.length > 0 ? { verificationHints: [...verificationHints] } : {}),
        ...(verifierTemplate ? { verifierTemplate } : {}),
      });
      continue;
    }

    if (result && !result.workerSuccess) {
      blockerLabels.push(label);
      items.push({
        label,
        action: "report_blocker",
        reason: normalizeOptionalString(result.error)
          ?? "Delegated worker failed before producing an acceptable handoff.",
        recommendedRuntimeAction: verifierTemplate ? "handoff_to_verifier" : "report_blocker",
        priority: "high",
        ...(verificationHints && verificationHints.length > 0 ? { verificationHints: [...verificationHints] } : {}),
        ...(verifierTemplate ? { verifierTemplate } : {}),
      });
      highPriorityLabels.push(label);
      continue;
    }

    const retryTemplate = task ? buildDelegationRetryTemplate(task, result) : undefined;
    const priority = result?.acceptanceGate?.rejectionConfidence === "high" ? "high" : "normal";
    const recommendedRuntimeAction = retryTemplate
      ? "retry_delegation"
      : verifierTemplate
        ? "handoff_to_verifier"
        : "report_blocker";
    retryLabels.push(label);
    items.push({
      label,
      action: "retry",
      reason: result?.acceptanceGate?.managerActionHint
        ?? result?.acceptanceGate?.summary
        ?? "Delegated result needs a follow-up handoff before it is safe to accept.",
      recommendedRuntimeAction,
      priority,
      ...(verificationHints && verificationHints.length > 0 ? { verificationHints: [...verificationHints] } : {}),
      ...(retryTemplate ? { template: retryTemplate } : {}),
      ...(verifierTemplate ? { verifierTemplate } : {}),
    });
    if (priority === "high") {
      highPriorityLabels.push(label);
    }
  }

  if (items.length === 0) {
    return undefined;
  }

  const recommendedRuntimeAction = resolveDelegationRuntimeAction(items);
  return {
    mode: input.toolName === "delegate_parallel" ? "parallel" : "single",
    summary: buildDelegationFollowUpSummary({
      toolName: input.toolName,
      acceptedLabels,
      retryLabels,
      blockerLabels,
    }),
    items,
    ...(recommendedRuntimeAction ? { recommendedRuntimeAction } : {}),
    ...(acceptedLabels.length > 0 ? { acceptedLabels } : {}),
    ...(retryLabels.length > 0 ? { retryLabels } : {}),
    ...(blockerLabels.length > 0 ? { blockerLabels } : {}),
    ...(highPriorityLabels.length > 0 ? { highPriorityLabels } : {}),
    ...(verifierHandoffLabels.length > 0 ? { verifierHandoffLabels } : {}),
  };
}

function readDelegationOwnershipArgs(value: unknown): Partial<DelegationOwnership> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const scopeSummary = normalizeOptionalString(record.scope_summary);
  const outOfScope = normalizeStringArray(record.out_of_scope);
  const writeScope = normalizeStringArray(record.write_scope);
  if (!scopeSummary && !outOfScope && !writeScope) {
    return undefined;
  }
  return {
    ...(scopeSummary ? { scopeSummary } : {}),
    ...(outOfScope ? { outOfScope } : {}),
    ...(writeScope ? { writeScope } : {}),
  };
}

function readDelegationAcceptanceArgs(value: unknown): Partial<DelegationAcceptance> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const doneDefinition = normalizeOptionalString(record.done_definition);
  const verificationHints = normalizeStringArray(record.verification_hints);
  if (!doneDefinition && !verificationHints) {
    return undefined;
  }
  return {
    ...(doneDefinition ? { doneDefinition } : {}),
    ...(verificationHints ? { verificationHints } : {}),
  };
}

function readDelegationDeliverableContractArgs(value: unknown): Partial<DelegationDeliverableContract> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const format = normalizeDeliverableFormat(record.format);
  const summary = normalizeOptionalString(record.summary);
  const requiredSections = normalizeStringArray(record.required_sections);
  if (!format && !summary && !requiredSections) {
    return undefined;
  }
  return {
    ...(format ? { format } : {}),
    ...(summary ? { summary } : {}),
    ...(requiredSections ? { requiredSections } : {}),
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function normalizeDeliverableFormat(value: unknown): DelegationDeliverableFormat | undefined {
  if (value !== "summary" && value !== "patch" && value !== "research_notes" && value !== "verification_report") {
    return undefined;
  }
  return value;
}

function evaluateContractSpecificChecks(
  output: string,
  deliverableFormat: DelegationDeliverableFormat | undefined,
): DelegationResultGateContractCheck[] {
  if (deliverableFormat !== "verification_report") {
    return [];
  }

  const findingsEvidence = findFirstMatchingSectionLabel(output, VERIFICATION_REPORT_FINDINGS_SECTION_LABELS);
  const recommendationEvidence = findFirstMatchingSectionLabel(output, VERIFICATION_REPORT_RECOMMENDATION_SECTION_LABELS);

  return [
    {
      id: "verification_report_findings",
      label: "Verification report is missing a findings section.",
      status: findingsEvidence ? "passed" : "failed",
      enforced: true,
      ...(findingsEvidence ? { evidence: findingsEvidence } : {}),
    },
    {
      id: "verification_report_recommendation",
      label: "Verification report is missing a recommendation or verdict section.",
      status: recommendationEvidence ? "passed" : "failed",
      enforced: true,
      ...(recommendationEvidence ? { evidence: recommendationEvidence } : {}),
    },
  ];
}

function findFirstMatchingSectionLabel(
  output: string,
  labels: readonly string[],
): string | undefined {
  const normalizedLabels = labels
    .map((label) => normalizeSectionLabel(label))
    .filter(Boolean);
  const lines = output.split(/\r?\n/u);
  for (const line of lines) {
    const normalized = normalizeSectionLabel(line);
    if (normalized && normalizedLabels.includes(normalized)) {
      return line.trim();
    }
  }
  return undefined;
}

function classifyGateRejectionConfidence(input: {
  missingRequiredSections?: string[];
  acceptanceCheckStatus: DelegationResultGate["acceptanceCheckStatus"];
  contractSpecificChecks: DelegationResultGateContractCheck[];
}): "low" | "medium" | "high" {
  const failedContractChecks = input.contractSpecificChecks.filter((check) => check.enforced && check.status === "failed");
  if ((input.missingRequiredSections && input.missingRequiredSections.length > 0)
    || input.acceptanceCheckStatus === "failed"
    || input.acceptanceCheckStatus === "missing"
    || failedContractChecks.length > 0) {
    return "high";
  }
  if (input.acceptanceCheckStatus === "unclear") {
    return "medium";
  }
  return "low";
}

function buildGateManagerActionHint(input: {
  accepted: boolean;
  missingRequiredSections?: string[];
  acceptanceCheckStatus: DelegationResultGate["acceptanceCheckStatus"];
  contractSpecificChecks: DelegationResultGateContractCheck[];
}): string {
  if (input.accepted) {
    return "the delegated result is structured enough to integrate or verify further.";
  }
  const failedContractChecks = input.contractSpecificChecks.filter((check) => check.enforced && check.status === "failed");
  if ((input.missingRequiredSections && input.missingRequiredSections.length > 0) || failedContractChecks.length > 0) {
    return "reject this handoff and re-delegate with explicit section requirements or a clearer deliverable contract.";
  }
  if (input.acceptanceCheckStatus === "missing" || input.acceptanceCheckStatus === "unclear") {
    return "reject or follow up until the worker provides an explicit done-definition verdict with supporting evidence.";
  }
  if (input.acceptanceCheckStatus === "failed") {
    return "do not integrate this result as complete. Escalate, reject, or hand off to a verifier before proceeding.";
  }
  return "do not integrate this result as complete. Follow up, reject, or hand off to a verifier.";
}

function cloneDelegationResultToolReview(
  entry: DelegationResultToolReview | undefined,
): DelegationResultToolReview | undefined {
  if (!entry) {
    return undefined;
  }
  return {
    ...entry,
    ...(entry.error ? { error: entry.error } : {}),
    ...(entry.acceptanceGate ? { acceptanceGate: cloneDelegationResultGate(entry.acceptanceGate) } : {}),
  };
}

function cloneDelegationResultFollowUpStrategy(
  strategy: DelegationResultFollowUpStrategy | undefined,
): DelegationResultFollowUpStrategy | undefined {
  if (!strategy) {
    return undefined;
  }
  return {
    ...strategy,
    items: strategy.items.map((item) => ({
      ...item,
      ...(item.recommendedRuntimeAction ? { recommendedRuntimeAction: item.recommendedRuntimeAction } : {}),
      ...(item.priority ? { priority: item.priority } : {}),
      ...(item.verificationHints ? { verificationHints: [...item.verificationHints] } : {}),
      ...(item.template ? { template: cloneDelegationResultFollowUpTemplate(item.template) } : {}),
      ...(item.verifierTemplate ? { verifierTemplate: cloneDelegationResultFollowUpTemplate(item.verifierTemplate) } : {}),
    })),
    ...(strategy.recommendedRuntimeAction ? { recommendedRuntimeAction: strategy.recommendedRuntimeAction } : {}),
    ...(strategy.acceptedLabels ? { acceptedLabels: [...strategy.acceptedLabels] } : {}),
    ...(strategy.retryLabels ? { retryLabels: [...strategy.retryLabels] } : {}),
    ...(strategy.blockerLabels ? { blockerLabels: [...strategy.blockerLabels] } : {}),
    ...(strategy.highPriorityLabels ? { highPriorityLabels: [...strategy.highPriorityLabels] } : {}),
    ...(strategy.verifierHandoffLabels ? { verifierHandoffLabels: [...strategy.verifierHandoffLabels] } : {}),
  };
}

function cloneDelegationResultFollowUpTemplate(
  template: DelegationResultFollowUpTemplate | undefined,
): DelegationResultFollowUpTemplate | undefined {
  if (!template) {
    return undefined;
  }
  return {
    ...template,
    ...(template.context ? { context: { ...template.context } } : {}),
    ...(template.ownership ? { ownership: cloneDelegationOwnership(template.ownership) } : {}),
    ...(template.acceptance ? { acceptance: cloneDelegationAcceptance(template.acceptance) } : {}),
    ...(template.deliverableContract ? { deliverableContract: cloneDelegationDeliverableContract(template.deliverableContract) } : {}),
  };
}

function readDelegationResultToolReview(value: unknown): DelegationResultToolReview | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.workerSuccess !== "boolean" || typeof record.accepted !== "boolean") {
    return undefined;
  }
  const acceptanceGate = readDelegationResultGate(record.acceptanceGate);
  const error = normalizeOptionalString(record.error);
  return {
    ...(typeof record.label === "string" && record.label.trim() ? { label: record.label.trim() } : {}),
    workerSuccess: record.workerSuccess,
    accepted: record.accepted,
    ...(error ? { error } : {}),
    ...(typeof record.taskId === "string" && record.taskId.trim() ? { taskId: record.taskId.trim() } : {}),
    ...(typeof record.sessionId === "string" && record.sessionId.trim() ? { sessionId: record.sessionId.trim() } : {}),
    ...(typeof record.outputPath === "string" && record.outputPath.trim() ? { outputPath: record.outputPath.trim() } : {}),
    ...(acceptanceGate ? { acceptanceGate } : {}),
  };
}

function readDelegationResultFollowUpStrategy(value: unknown): DelegationResultFollowUpStrategy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const mode = record.mode === "single" || record.mode === "parallel" ? record.mode : undefined;
  const summary = normalizeOptionalString(record.summary);
  const items = Array.isArray(record.items)
    ? record.items
        .map((item) => readDelegationResultFollowUpItem(item))
        .filter((item): item is DelegationResultFollowUpItem => Boolean(item))
    : [];
  if (!mode || !summary || items.length === 0) {
    return undefined;
  }
  const acceptedLabels = normalizeStringArray(record.acceptedLabels);
  const retryLabels = normalizeStringArray(record.retryLabels);
  const blockerLabels = normalizeStringArray(record.blockerLabels);
  const highPriorityLabels = normalizeStringArray(record.highPriorityLabels);
  const verifierHandoffLabels = normalizeStringArray(record.verifierHandoffLabels);
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

function readDelegationResultFollowUpItem(value: unknown): DelegationResultFollowUpItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const label = normalizeOptionalString(record.label);
  const action = readDelegationResultFollowUpAction(record.action);
  const reason = normalizeOptionalString(record.reason);
  if (!label || !action || !reason) {
    return undefined;
  }
  const verificationHints = normalizeStringArray(record.verificationHints);
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

function readDelegationResultFollowUpTemplate(value: unknown): DelegationResultFollowUpTemplate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const toolName = record.toolName === "delegate_task" ? record.toolName : undefined;
  const instruction = normalizeOptionalString(record.instruction);
  if (!toolName || !instruction) {
    return undefined;
  }
  const context = isJsonObjectRecord(record.context) ? { ...record.context } as JsonObject : undefined;
  const ownership = readDelegationOwnershipArgs(record.ownership);
  const acceptance = readDelegationAcceptanceArgs(record.acceptance);
  const deliverableContract = readDelegationDeliverableContractArgs(record.deliverableContract);
  return {
    toolName,
    instruction,
    ...(normalizeOptionalString(record.agentId) ? { agentId: normalizeOptionalString(record.agentId)! } : {}),
    ...(context ? { context } : {}),
    ...(ownership ? { ownership } : {}),
    ...(acceptance ? { acceptance } : {}),
    ...(deliverableContract ? { deliverableContract } : {}),
  };
}

function readDelegationResultGate(value: unknown): DelegationResultGate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.enforced !== "boolean" || typeof record.accepted !== "boolean") {
    return undefined;
  }
  const reasons = normalizeStringArray(record.reasons) ?? [];
  const requiredSections = normalizeStringArray(record.requiredSections);
  const missingRequiredSections = normalizeStringArray(record.missingRequiredSections);
  const verificationHints = normalizeStringArray(record.verificationHints);
  const contractSpecificChecks = Array.isArray(record.contractSpecificChecks)
    ? record.contractSpecificChecks
        .map((check) => readDelegationResultGateContractCheck(check))
        .filter((check): check is DelegationResultGateContractCheck => Boolean(check))
    : undefined;
  const acceptanceCheckStatus = readAcceptanceCheckStatus(record.acceptanceCheckStatus);
  if (!acceptanceCheckStatus) {
    return undefined;
  }
  return {
    enforced: record.enforced,
    accepted: record.accepted,
    summary: normalizeOptionalString(record.summary) ?? "",
    reasons,
    ...(normalizeDeliverableFormat(record.deliverableFormat) ? { deliverableFormat: normalizeDeliverableFormat(record.deliverableFormat)! } : {}),
    ...(requiredSections ? { requiredSections } : {}),
    ...(missingRequiredSections ? { missingRequiredSections } : {}),
    ...(normalizeOptionalString(record.doneDefinition) ? { doneDefinition: normalizeOptionalString(record.doneDefinition)! } : {}),
    acceptanceCheckStatus,
    ...(normalizeOptionalString(record.acceptanceCheckEvidence) ? { acceptanceCheckEvidence: normalizeOptionalString(record.acceptanceCheckEvidence)! } : {}),
    ...(verificationHints ? { verificationHints } : {}),
    ...(contractSpecificChecks && contractSpecificChecks.length > 0 ? { contractSpecificChecks } : {}),
    ...(readRejectionConfidence(record.rejectionConfidence) ? { rejectionConfidence: readRejectionConfidence(record.rejectionConfidence)! } : {}),
    ...(normalizeOptionalString(record.managerActionHint) ? { managerActionHint: normalizeOptionalString(record.managerActionHint)! } : {}),
  };
}

function readDelegationResultGateContractCheck(value: unknown): DelegationResultGateContractCheck | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeOptionalString(record.id);
  const label = normalizeOptionalString(record.label);
  const status = readContractCheckStatus(record.status);
  if (!id || !label || !status || typeof record.enforced !== "boolean") {
    return undefined;
  }
  return {
    id,
    label,
    status,
    enforced: record.enforced,
    ...(normalizeOptionalString(record.evidence) ? { evidence: normalizeOptionalString(record.evidence)! } : {}),
  };
}

function readAcceptanceCheckStatus(value: unknown): DelegationResultGate["acceptanceCheckStatus"] | undefined {
  switch (value) {
    case "not_requested":
    case "passed":
    case "missing":
    case "failed":
    case "unclear":
      return value;
    default:
      return undefined;
  }
}

function readContractCheckStatus(value: unknown): DelegationResultGateContractCheck["status"] | undefined {
  switch (value) {
    case "passed":
    case "failed":
      return value;
    default:
      return undefined;
  }
}

function readRejectionConfidence(value: unknown): DelegationResultGate["rejectionConfidence"] | undefined {
  switch (value) {
    case "low":
    case "medium":
    case "high":
      return value;
    default:
      return undefined;
  }
}

function readDelegationResultFollowUpAction(value: unknown): DelegationResultFollowUpAction | undefined {
  switch (value) {
    case "accept":
    case "retry":
    case "report_blocker":
      return value;
    default:
      return undefined;
  }
}

function readDelegationResultRuntimeAction(value: unknown): DelegationResultRuntimeAction | undefined {
  switch (value) {
    case "accept_result":
    case "retry_delegation":
    case "handoff_to_verifier":
    case "report_blocker":
      return value;
    default:
      return undefined;
  }
}

function readDelegationResultRuntimeActionPriority(value: unknown): DelegationResultRuntimeActionPriority | undefined {
  switch (value) {
    case "normal":
    case "high":
      return value;
    default:
      return undefined;
  }
}

function cloneDelegationOwnership(
  value: Partial<DelegationOwnership> | undefined,
): Partial<DelegationOwnership> | undefined {
  if (!value) {
    return undefined;
  }
  return {
    ...value,
    ...(value.outOfScope ? { outOfScope: [...value.outOfScope] } : {}),
    ...(value.writeScope ? { writeScope: [...value.writeScope] } : {}),
  };
}

function cloneDelegationAcceptance(
  value: Partial<DelegationAcceptance> | undefined,
): Partial<DelegationAcceptance> | undefined {
  if (!value) {
    return undefined;
  }
  return {
    ...value,
    ...(value.verificationHints ? { verificationHints: [...value.verificationHints] } : {}),
  };
}

function cloneDelegationDeliverableContract(
  value: Partial<DelegationDeliverableContract> | undefined,
): Partial<DelegationDeliverableContract> | undefined {
  if (!value) {
    return undefined;
  }
  return {
    ...value,
    ...(value.requiredSections ? { requiredSections: [...value.requiredSections] } : {}),
  };
}

type DelegationTaskTemplate = {
  label: string;
  agentId?: string;
  instruction: string;
  context?: JsonObject;
  ownership?: Partial<DelegationOwnership>;
  acceptance?: Partial<DelegationAcceptance>;
  deliverableContract?: Partial<DelegationDeliverableContract>;
};

function readDelegationTaskTemplates(
  toolName: "sessions_spawn" | "delegate_task" | "delegate_parallel",
  requestArguments: Record<string, unknown>,
): DelegationTaskTemplate[] {
  if (toolName === "delegate_parallel") {
    const tasks = Array.isArray(requestArguments.tasks) ? requestArguments.tasks : [];
    return tasks
      .map((task, index) => readDelegationTaskTemplate(task, `Task ${index + 1}`))
      .filter((task): task is DelegationTaskTemplate => Boolean(task));
  }

  const single = readDelegationTaskTemplate(requestArguments, toolName === "delegate_task" ? "Delegated task" : "Spawned task");
  return single ? [single] : [];
}

function readDelegationTaskTemplate(
  value: unknown,
  fallbackLabel: string,
): DelegationTaskTemplate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const instruction = normalizeOptionalString(record.instruction);
  if (!instruction) {
    return undefined;
  }
  const agentId = normalizeOptionalString(record.agent_id);
  const label = agentId ? `${fallbackLabel} / ${agentId}` : `${fallbackLabel} / default`;
  const context = isJsonObjectRecord(record.context) ? { ...record.context } as JsonObject : undefined;
  const delegationContract = readStructuredDelegationContractArgs(record);
  return {
    label,
    instruction,
    ...(agentId ? { agentId } : {}),
    ...(context ? { context } : {}),
    ...(delegationContract.ownership ? { ownership: delegationContract.ownership } : {}),
    ...(delegationContract.acceptance ? { acceptance: delegationContract.acceptance } : {}),
    ...(delegationContract.deliverableContract ? { deliverableContract: delegationContract.deliverableContract } : {}),
  };
}

function buildDelegationRetryTemplate(
  task: DelegationTaskTemplate,
  result: DelegationResultToolReview | undefined,
): DelegationResultFollowUpTemplate {
  const followUpReason = result?.acceptanceGate?.summary
    ?? result?.error
    ?? "Return an updated handoff that satisfies the structured acceptance gate.";
  const instruction = `${task.instruction}\n\nFollow-up requirement: ${followUpReason}`.trim();
  return {
    toolName: "delegate_task",
    instruction,
    ...(task.agentId ? { agentId: task.agentId } : {}),
    ...(task.context ? { context: { ...task.context } } : {}),
    ...(task.ownership ? { ownership: cloneDelegationOwnership(task.ownership) } : {}),
    ...(task.acceptance ? { acceptance: cloneDelegationAcceptance(task.acceptance) } : {}),
    ...(task.deliverableContract ? { deliverableContract: cloneDelegationDeliverableContract(task.deliverableContract) } : {}),
  };
}

function buildDelegationVerifierTemplate(
  task: DelegationTaskTemplate,
  result: DelegationResultToolReview | undefined,
): DelegationResultFollowUpTemplate {
  const gateSummary = result?.acceptanceGate?.summary;
  const gateReason = result?.acceptanceGate?.managerActionHint;
  const originalRequiredSections = task.deliverableContract?.requiredSections ?? [];
  const verificationHints = dedupeStrings([
    ...(task.acceptance?.verificationHints ?? []),
    originalRequiredSections.length > 0
      ? `Audit the original required sections: ${originalRequiredSections.join(" | ")}`
      : undefined,
  ]);
  const requiredSections = dedupeStrings([
    "Findings",
    "Recommendation",
    task.acceptance?.doneDefinition ? "Done Definition Check" : undefined,
    originalRequiredSections.length > 0 ? "Required Sections Audit" : undefined,
  ]);
  const instruction = [
    `Verify the delegated result for ${task.label}.`,
    gateSummary ? `Current gate summary: ${gateSummary}` : undefined,
    gateReason ? `Manager concern: ${gateReason}` : undefined,
    task.acceptance?.doneDefinition
      ? `Done definition to evaluate: ${task.acceptance.doneDefinition}`
      : undefined,
    originalRequiredSections.length > 0
      ? `Check whether the original required sections were satisfied: ${originalRequiredSections.join(" | ")}.`
      : undefined,
    "Do not expand scope into new implementation work. Focus on verification evidence and an explicit accept/revise/block recommendation.",
  ].filter(Boolean).join("\n\n");
  return {
    toolName: "delegate_task",
    agentId: "verifier",
    instruction,
    ...(task.context ? { context: { ...task.context } } : {}),
    ownership: {
      scopeSummary: `Verify the delegated handoff for ${task.label}.`,
      ...(task.ownership?.outOfScope || task.ownership?.writeScope
        ? {
            outOfScope: dedupeStrings([
              ...(task.ownership?.outOfScope ?? []),
              "Do not implement new changes unless the manager explicitly asks for fixes.",
            ]),
          }
        : {
            outOfScope: ["Do not implement new changes unless the manager explicitly asks for fixes."],
          }),
    },
    acceptance: {
      ...(task.acceptance?.doneDefinition ? { doneDefinition: task.acceptance.doneDefinition } : {}),
      ...(verificationHints.length > 0 ? { verificationHints } : {}),
    },
    deliverableContract: {
      format: "verification_report",
      summary: task.deliverableContract?.summary
        ? `Verification report for ${task.deliverableContract.summary}`
        : `Verification report for ${task.label}`,
      ...(requiredSections.length > 0 ? { requiredSections } : {}),
    },
  };
}

function resolveDelegationRuntimeAction(
  items: DelegationResultFollowUpItem[],
): DelegationResultRuntimeAction | undefined {
  const selectAction = (priority: DelegationResultRuntimeActionPriority | undefined): DelegationResultRuntimeAction | undefined => {
    const actions = items
      .filter((item) => !priority || item.priority === priority)
      .map((item) => item.recommendedRuntimeAction)
      .filter((action): action is DelegationResultRuntimeAction => Boolean(action));
    if (actions.includes("retry_delegation")) return "retry_delegation";
    if (actions.includes("handoff_to_verifier")) return "handoff_to_verifier";
    if (actions.includes("report_blocker")) return "report_blocker";
    if (actions.includes("accept_result")) return "accept_result";
    return undefined;
  };

  return selectAction("high") ?? selectAction(undefined);
}

function buildDelegationFollowUpSummary(input: {
  toolName: "sessions_spawn" | "delegate_task" | "delegate_parallel";
  acceptedLabels: string[];
  retryLabels: string[];
  blockerLabels: string[];
}): string {
  const acceptedSummary = summarizeLabelList(input.acceptedLabels, 3);
  const retrySummary = summarizeLabelList(input.retryLabels, 3);
  const blockerSummary = summarizeLabelList(input.blockerLabels, 3);
  const parts: string[] = [];
  if (acceptedSummary) {
    parts.push(`accept now: ${acceptedSummary}`);
  }
  if (retrySummary) {
    parts.push(`retry with follow-up delegation: ${retrySummary}`);
  }
  if (blockerSummary) {
    parts.push(`report blockers: ${blockerSummary}`);
  }
  if (parts.length === 0) {
    return input.toolName === "delegate_parallel"
      ? "Parallel fan-in did not produce a clear next-step classification."
      : "Delegated result needs manual review before it is safe to accept.";
  }
  if (input.toolName === "delegate_parallel") {
    return `Parallel fan-in strategy: ${parts.join("; ")}.`;
  }
  return `Suggested next step: ${parts.join("; ")}.`;
}

function summarizeLabelList(labels: readonly string[] | undefined, maxItems: number): string | undefined {
  if (!labels || labels.length === 0) {
    return undefined;
  }
  const normalized = labels
    .map((label) => label.trim())
    .filter(Boolean);
  if (normalized.length === 0) {
    return undefined;
  }
  const selected = normalized.slice(0, Math.max(1, maxItems));
  const omittedCount = normalized.length - selected.length;
  return omittedCount > 0
    ? `${selected.join(" | ")} (+${omittedCount} more)`
    : selected.join(" | ");
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const item = typeof value === "string" ? value.trim() : "";
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findMissingRequiredSections(output: string, requiredSections: readonly string[] | undefined): string[] | undefined {
  if (!requiredSections || requiredSections.length === 0) {
    return undefined;
  }

  const missing = requiredSections.filter((section) => !hasSectionLabel(output, section));
  return missing.length > 0 ? missing : undefined;
}

function hasSectionLabel(output: string, sectionName: string): boolean {
  const normalizedSection = normalizeSectionLabel(sectionName);
  if (!normalizedSection) {
    return false;
  }

  return output
    .split(/\r?\n/u)
    .some((line) => {
      const normalizedLine = normalizeSectionLabel(line);
      return Boolean(normalizedLine && normalizedLine === normalizedSection);
    });
}

function extractAcceptanceCheckEvidence(output: string): string | undefined {
  const lines = output.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const matchedLabel = matchSectionLabel(lines[index] ?? "", ACCEPTANCE_CHECK_SECTION_LABELS);
    if (!matchedLabel.matched) {
      continue;
    }

    if (matchedLabel.inlineRemainder) {
      return matchedLabel.inlineRemainder;
    }

    const collected: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor]?.trim() ?? "";
      if (!nextLine) {
        if (collected.length > 0) {
          break;
        }
        continue;
      }
      if (looksLikeSectionBoundary(nextLine)) {
        break;
      }
      collected.push(nextLine);
      if (collected.length >= 4) {
        break;
      }
    }

    const evidence = collected.join(" ").trim();
    return evidence || undefined;
  }

  return undefined;
}

function classifyAcceptanceCheck(value: string | undefined): DelegationResultGate["acceptanceCheckStatus"] {
  if (!value) {
    return "missing";
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "missing";
  }
  if (/(not satisfied|does not satisfy|doesn't satisfy|not ready|blocked|fail(?:ed|s)?|missing|incomplete|cannot|can't|no\b)/u.test(normalized)) {
    return "failed";
  }
  if (/(satisfied|satisfies|meets?|met|ready|complete(?:d)?|done|pass(?:ed|es)?|acceptable|accepted|yes\b)/u.test(normalized)) {
    return "passed";
  }
  return "unclear";
}

function looksLikeSectionBoundary(line: string): boolean {
  if (/^#{1,6}\s+/u.test(line)) {
    return true;
  }
  if (/^\*\*.+\*\*:?\s*$/u.test(line)) {
    return true;
  }
  if (/^[A-Za-z0-9][A-Za-z0-9 /&()_.-]{0,78}[:：]\s*$/u.test(line)) {
    return true;
  }
  return false;
}

function matchSectionLabel(line: string, labels: readonly string[]): {
  matched: boolean;
  inlineRemainder?: string;
} {
  const trimmed = line.trim();
  if (!trimmed) {
    return { matched: false };
  }

  const colonMatch = trimmed.match(/^(.+?)[:：]\s*(.+)$/u);
  if (colonMatch) {
    const label = normalizeSectionLabel(colonMatch[1] ?? "");
    const inlineRemainder = normalizeOptionalString(colonMatch[2]);
    if (label && labels.some((candidate) => normalizeSectionLabel(candidate) === label)) {
      return {
        matched: true,
        ...(inlineRemainder ? { inlineRemainder } : {}),
      };
    }
  }

  const normalizedLine = normalizeSectionLabel(trimmed);
  if (normalizedLine && labels.some((candidate) => normalizeSectionLabel(candidate) === normalizedLine)) {
    return { matched: true };
  }

  return { matched: false };
}

function normalizeSectionLabel(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let normalized = trimmed
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^\*\*(.+)\*\*:?\s*$/u, "$1")
    .replace(/^[-*]\s+/u, "")
    .replace(/[:：]\s*$/u, "")
    .replace(/^[0-9]+[.)]\s+/u, "")
    .replace(/[`*_]/gu, "")
    .trim();

  if (!normalized) {
    return undefined;
  }

  normalized = normalized
    .replace(/\s+/gu, " ")
    .toLowerCase();
  return normalized || undefined;
}
