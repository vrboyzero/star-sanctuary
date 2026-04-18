import type { AgentProfileDefaultRole, SystemPromptSection } from "@belldandy/agent";
import {
  buildToolContractV2CompactPromptSummary,
  type ToolContractV2,
} from "@belldandy/skills";

import { createGatewaySystemPromptSection } from "./gateway-prompt-runtime.js";

export type BuildAgentRuntimePromptSectionsOptions = {
  hasAvailableTools: boolean;
  visibleContracts: readonly ToolContractV2[];
  canDelegate: boolean;
  role?: AgentProfileDefaultRole;
};

export function buildAgentRuntimePromptSections(
  options: BuildAgentRuntimePromptSectionsOptions,
): SystemPromptSection[] {
  const sections: SystemPromptSection[] = [];

  if (options.hasAvailableTools) {
    sections.push(buildToolUsePolicySection());
  }

  const toolGovernanceSection = buildToolContractGovernanceSection(options.visibleContracts);
  if (toolGovernanceSection) {
    sections.push(toolGovernanceSection);
  }

  const delegationSection = buildDelegationOperatingPolicySection({
    canDelegate: options.canDelegate,
  });
  if (delegationSection) {
    sections.push(delegationSection);
  }

  const roleSection = buildRoleExecutionPolicySection({
    role: options.role,
  });
  if (roleSection) {
    sections.push(roleSection);
  }

  return sections;
}

export function buildToolUsePolicySection(): SystemPromptSection {
  return createGatewaySystemPromptSection({
    id: "tool-use-policy",
    label: "tool-use-policy",
    source: "runtime",
    priority: 55,
    text: [
      "## Tool Use Operating Policy",
      "",
      "Use tools only when they reduce uncertainty or complete the task more safely than pure reasoning.",
      "1. Confirm the exact subproblem before calling a tool.",
      "2. Prefer the smallest, lowest-risk tool that can answer it.",
      "3. Search/read before write, inspect before patch, verify before delivery.",
      "4. Before any write, command, external action, or broad change, confirm the target and likely impact.",
      "5. If a tool fails, classify the failure before retrying; do not repeat the same failing call blindly.",
      "6. After a change, run the smallest useful verification before claiming success.",
    ].join("\n"),
  });
}

export function buildToolContractGovernanceSection(
  contracts: readonly ToolContractV2[],
): SystemPromptSection | undefined {
  const text = buildToolContractV2CompactPromptSummary(contracts, {
    maxTools: 8,
    maxBulletsPerField: 1,
  });
  if (!text) {
    return undefined;
  }
  return createGatewaySystemPromptSection({
    id: "tool-contract-governance",
    label: "tool-contract-governance",
    source: "runtime",
    priority: 56,
    text,
  });
}

export function buildDelegationOperatingPolicySection(input: {
  canDelegate: boolean;
}): SystemPromptSection | undefined {
  if (!input.canDelegate) {
    return undefined;
  }

  return createGatewaySystemPromptSection({
    id: "delegation-operating-policy",
    label: "delegation-operating-policy",
    source: "runtime",
    priority: 57,
    text: [
      "## Delegation Operating Policy",
      "",
      "Delegate only when the subtask is concrete, bounded, and can be handed off without blocking the immediate next local step.",
      "- Keep the first critical-path step local when you need its result right away.",
      "- When a delegated subtask is meaningful, include a structured contract: `ownership.scope_summary`, `ownership.out_of_scope`, `acceptance.done_definition`, and `deliverable_contract.format/required_sections`.",
      "- Give each worker a clear role, scope, expected output, and stop condition.",
      "- Avoid overlapping write ownership across parallel workers.",
      "- Wait immediately only when the next safe local step is blocked on the delegated result or the result is needed to prove safety/completion.",
      "- While workers run, keep progressing on non-overlapping local work.",
      "- Reject or follow up on delegated results that exceed owned scope, violate out-of-scope limits, miss required sections, or fail the done definition.",
      "- When a delegated result is rejected, make the next step explicit: classify it as accept, retry with a follow-up delegation, or report blocker.",
      "- If you hand the work to a verifier, inherit the existing `acceptance.verification_hints` into the verifier handoff instead of dropping them.",
      "- In parallel fan-in, summarize which results are safe to accept now, which need retry, and which are hard blockers before you continue.",
      "- Review and integrate delegated results instead of copying them blindly.",
    ].join("\n"),
  });
}

export function buildRoleExecutionPolicySection(input: {
  role?: AgentProfileDefaultRole;
}): SystemPromptSection | undefined {
  const role = input.role;
  if (!role || role === "default") {
    return undefined;
  }

  const text = ROLE_EXECUTION_POLICY_TEXT[role];
  if (!text) {
    return undefined;
  }

  return createGatewaySystemPromptSection({
    id: "role-execution-policy",
    label: "role-execution-policy",
    source: "profile",
    priority: 58,
    text,
  });
}

const ROLE_EXECUTION_POLICY_TEXT: Partial<Record<Exclude<AgentProfileDefaultRole, "default">, string>> = {
  coder: [
    "## Role Execution Policy (coder)",
    "",
    "Prefer code-aware tools and local repository evidence over general assumptions.",
    "- Inspect the current implementation before editing.",
    "- Favor minimal diffs and keep changes inside existing module boundaries when possible.",
    "- After edits, run the smallest useful validation for the touched path.",
  ].join("\n"),
  researcher: [
    "## Role Execution Policy (researcher)",
    "",
    "Prefer read/search/browser workflows and gather evidence before proposing conclusions.",
    "- Search local context first, then external sources only when needed.",
    "- Avoid mutating the workspace unless the task explicitly requires it.",
    "- Report uncertainty and keep source-backed findings separate from inference.",
  ].join("\n"),
  verifier: [
    "## Role Execution Policy (verifier)",
    "",
    "Your primary job is validation, not implementation momentum.",
    "- Prefer read, diff, test, and browser checks over write actions.",
    "- Look for regressions, missing verification, and unsupported claims.",
    "- Do not declare success from implementation alone; require evidence from checks or observable behavior.",
  ].join("\n"),
};
