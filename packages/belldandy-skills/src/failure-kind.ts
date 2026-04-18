import type { ToolCallResult, ToolFailureKind } from "./types.js";

const TOOL_FAILURE_KINDS = new Set<ToolFailureKind>([
  "input_error",
  "permission_or_policy",
  "environment_error",
  "business_logic_error",
  "unknown",
]);

export function isToolFailureKind(value: unknown): value is ToolFailureKind {
  return typeof value === "string" && TOOL_FAILURE_KINDS.has(value as ToolFailureKind);
}

export function readToolFailureKind(value: unknown): ToolFailureKind | undefined {
  return isToolFailureKind(value) ? value : undefined;
}

export function inferToolFailureKindFromError(error?: string): ToolFailureKind {
  const normalized = normalizeForMatching(error);
  if (!normalized) {
    return "unknown";
  }

  if (/(permission|forbidden|denied|unauthorized|policy|blocked|approval|confirm|security error|allowlist|blocklist|white ?list|black ?list|禁止|无权|白名单|黑名单|敏感文件|受保护|安全矩阵|security block)/.test(normalized)) {
    return "permission_or_policy";
  }
  if (/(invalid|missing|required|malformed|schema|json|parse|unknown field|unknown argument|not found|enoent|input error|argument|参数错误|必填|不能为空|必须是|无效|未找到|不存在|不是文件|路径不能为空|路径越界|url 必须|tasks must be|instruction is required)/.test(normalized)) {
    return "input_error";
  }
  if (/(timeout|timed out|network|offline|unavailable|econn|socket|dns|spawn|abort|io error|disk|filesystem|eacces|eperm|runtime lost|session runtime lost|请求超时|超时|网络|中断|spawn error|bridge run failed|runtime unavailable)/.test(normalized)) {
    return "environment_error";
  }
  if (/(conflict|already exists|precondition|busy|locked|state|unsupported|rejected|cannot|gate rejected|acceptance gate|deliverable contract|verification report|manager action|验收闸门|拒绝|状态不允许|冲突|房间未找到|room not found|not in a community room|multiple community rooms)/.test(normalized)) {
    return "business_logic_error";
  }
  return "unknown";
}

export function resolveToolFailureKind(input: {
  failureKind?: ToolFailureKind;
  error?: string;
}): ToolFailureKind | undefined {
  if (input.failureKind) {
    return input.failureKind;
  }
  if (typeof input.error === "string" && input.error.trim()) {
    return inferToolFailureKindFromError(input.error);
  }
  return undefined;
}

export function normalizeToolCallResultFailureKind(result: ToolCallResult): ToolCallResult {
  if (result.success) {
    return result;
  }
  const failureKind = resolveToolFailureKind({
    failureKind: result.failureKind,
    error: result.error,
  });
  if (!failureKind || result.failureKind === failureKind) {
    return result;
  }
  return {
    ...result,
    failureKind,
  };
}

export function buildFailureToolCallResult(input: {
  id: string;
  name: string;
  start: number;
  error: string;
  output?: string;
  failureKind?: ToolFailureKind;
  metadata?: ToolCallResult["metadata"];
}): ToolCallResult {
  const failureKind = resolveToolFailureKind({
    failureKind: input.failureKind,
    error: input.error,
  });
  return {
    id: input.id,
    name: input.name,
    success: false,
    output: input.output ?? "",
    error: input.error,
    ...(failureKind ? { failureKind } : {}),
    durationMs: Date.now() - input.start,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function normalizeForMatching(value?: string): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}
