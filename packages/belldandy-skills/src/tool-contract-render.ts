import type { ToolContractV2 } from "./tool-contract-v2.js";

export function renderToolContractV2Summary(contract: ToolContractV2): string {
  const lines: string[] = [
    `## ${contract.name}`,
  ];
  const meta: string[] = [];
  if (contract.family) meta.push(`family=${contract.family}`);
  if (contract.riskLevel) meta.push(`risk=${contract.riskLevel}`);
  meta.push(`readonly=${contract.isReadOnly ? "yes" : "no"}`);
  meta.push(`permission=${contract.needsPermission ? "required" : "not_required"}`);
  if (meta.length > 0) {
    lines.push(meta.join(" | "));
  }
  if (contract.activityDescription) {
    lines.push(`Activity: ${contract.activityDescription}`);
  }
  if (contract.recommendedWhen.length > 0) {
    lines.push(`Use when: ${contract.recommendedWhen.join("; ")}`);
  }
  if (contract.avoidWhen.length > 0) {
    lines.push(`Avoid when: ${contract.avoidWhen.join("; ")}`);
  }
  if (contract.confirmWhen.length > 0) {
    lines.push(`Confirm when: ${contract.confirmWhen.join("; ")}`);
  }
  if (contract.preflightChecks.length > 0) {
    lines.push(`Preflight: ${contract.preflightChecks.join("; ")}`);
  }
  if (contract.expectedOutput.length > 0) {
    lines.push(`Expected output: ${contract.expectedOutput.join("; ")}`);
  }
  if (contract.fallbackStrategy.length > 0) {
    lines.push(`Fallback: ${contract.fallbackStrategy.join("; ")}`);
  }
  if (contract.sideEffectSummary.length > 0) {
    lines.push(`Side effects: ${contract.sideEffectSummary.join("; ")}`);
  }
  if (contract.userVisibleRiskNote) {
    lines.push(`Risk note: ${contract.userVisibleRiskNote}`);
  }
  return lines.join("\n");
}

export function buildToolContractV2PromptSummary(contracts: readonly ToolContractV2[]): string {
  if (contracts.length === 0) {
    return "";
  }
  return [
    "# Tool Contract V2",
    "",
    "Apply these governance and behavior rules before selecting a tool.",
    "",
    ...contracts.map((contract) => renderToolContractV2Summary(contract)),
  ].join("\n\n").trim();
}

function takeCompactItems(values: readonly string[], maxItems: number): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, Math.max(0, maxItems));
}

function formatCompactField(label: string, values: readonly string[], maxItems: number): string | undefined {
  const items = takeCompactItems(values, maxItems);
  if (items.length === 0) {
    return undefined;
  }
  return `  ${label}: ${items.join(" | ")}`;
}

function getCompactRiskScore(contract: ToolContractV2): number {
  let score = 0;
  switch (contract.riskLevel) {
    case "critical":
      score += 40;
      break;
    case "high":
      score += 30;
      break;
    case "medium":
      score += 20;
      break;
    case "low":
      score += 10;
      break;
    default:
      break;
  }
  if (!contract.isReadOnly) score += 8;
  if (contract.needsPermission) score += 6;
  if (contract.confirmWhen.length > 0) score += 4;
  if (contract.preflightChecks.length > 0) score += 3;
  if (contract.fallbackStrategy.length > 0) score += 2;
  return score;
}

function renderToolContractV2CompactSummary(
  contract: ToolContractV2,
  options: {
    maxBulletsPerField: number;
  },
): string {
  const meta: string[] = [];
  if (contract.family) meta.push(`family=${contract.family}`);
  if (contract.riskLevel) meta.push(`risk=${contract.riskLevel}`);
  meta.push(`readonly=${contract.isReadOnly ? "yes" : "no"}`);
  meta.push(`permission=${contract.needsPermission ? "required" : "not_required"}`);

  const lines = [
    `- \`${contract.name}\`${meta.length > 0 ? ` | ${meta.join(" | ")}` : ""}`,
  ];

  const compactFields = [
    formatCompactField("Use when", contract.recommendedWhen, options.maxBulletsPerField),
    formatCompactField("Avoid when", contract.avoidWhen, options.maxBulletsPerField),
    formatCompactField("Preflight", contract.preflightChecks, options.maxBulletsPerField),
    formatCompactField("Fallback", contract.fallbackStrategy, options.maxBulletsPerField),
  ].filter(Boolean) as string[];

  if (compactFields.length > 0) {
    lines.push(...compactFields);
  }

  return lines.join("\n");
}

export function buildToolContractV2CompactPromptSummary(
  contracts: readonly ToolContractV2[],
  options?: {
    maxTools?: number;
    maxBulletsPerField?: number;
  },
): string {
  if (contracts.length === 0) {
    return "";
  }

  const maxTools = Math.max(1, options?.maxTools ?? 8);
  const maxBulletsPerField = Math.max(1, options?.maxBulletsPerField ?? 1);
  const ordered = [...contracts].sort((left, right) => {
    const scoreDiff = getCompactRiskScore(right) - getCompactRiskScore(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return left.name.localeCompare(right.name);
  });
  const selected = ordered.slice(0, maxTools);
  const omittedCount = Math.max(0, ordered.length - selected.length);

  const lines = [
    "## Tool Contract Governance",
    "",
    "These are the most important governance notes for the currently visible tools.",
    "Prefer lower-risk tools first and follow the per-tool checks before execution.",
    "",
    ...selected.map((contract) => renderToolContractV2CompactSummary(contract, { maxBulletsPerField })),
  ];

  if (omittedCount > 0) {
    lines.push("", `- ${omittedCount} additional visible tools omitted to keep this summary compact.`);
  }

  return lines.join("\n").trim();
}

export function buildLaunchPermissionDeniedReason(input: {
  toolName: string;
  mode: string;
  summary?: string;
  permissionRequired?: boolean;
}): string {
  const base = `工具 ${input.toolName} 在 permissionMode=${input.mode} 下不可用。`;
  const detail = input.summary ? ` 契约摘要：${input.summary}` : "";
  const permission = input.permissionRequired ? " 该工具需要额外权限确认。" : "";
  return `${base}${permission}${detail}`.trim();
}

export function buildLaunchRolePolicyDeniedReason(input: {
  toolName: string;
  role?: string;
  summary?: string;
  family?: string;
  riskLevel?: string;
  maxToolRiskLevel?: string;
}): string {
  const roleText = input.role ?? "default";
  const familyText = input.family ? `family=${input.family}` : "";
  const riskText = input.riskLevel && input.maxToolRiskLevel
    ? `risk=${input.riskLevel}, max=${input.maxToolRiskLevel}`
    : input.riskLevel
      ? `risk=${input.riskLevel}`
      : "";
  const details = [familyText, riskText].filter(Boolean).join(" | ");
  const summary = input.summary ? ` 契约摘要：${input.summary}` : "";
  return `工具 ${input.toolName} 不符合当前 role=${roleText} 的运行策略${details ? `（${details}）` : ""}。${summary}`.trim();
}
