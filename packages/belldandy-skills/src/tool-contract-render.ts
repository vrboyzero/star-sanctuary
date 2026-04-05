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
