import crypto from "node:crypto";
import type { ToolCallResult, ToolContext } from "../../types.js";
import { runCommandTool } from "../system/exec.js";
import { persistBridgeRunArtifacts } from "./artifacts.js";
import { resolveBridgeSubtaskSemantics } from "./governance.js";
import { executeBridgeMcpRun } from "./runtime-mcp.js";
import {
  buildBridgeCommandTokens,
  clampBridgeOutput,
  resolveBridgeTimeoutMs,
  resolveBridgeWorkingDirectory,
} from "./policy.js";
import type { BridgeRunArtifactSummary, BridgeRunParsedProcessResult, BridgeTargetConfig } from "./types.js";

function parseRunCommandResult(result: ToolCallResult): BridgeRunParsedProcessResult {
  if (result.success) {
    return {
      success: true,
      exitCode: 0,
      stdout: result.output,
      stderr: "",
      timedOut: false,
    };
  }

  const processMatch = /^Process exited with code (\d+)\nStderr:\s*([\s\S]*)$/u.exec(result.error ?? "");
  if (processMatch) {
    return {
      success: false,
      exitCode: Number(processMatch[1]),
      stdout: result.output,
      stderr: processMatch[2] ?? "",
      timedOut: false,
      errorSummary: result.error,
    };
  }

  const timeoutMatch = /^Timeout after (\d+)ms\nStderr:\s*([\s\S]*)$/u.exec(result.error ?? "");
  if (timeoutMatch) {
    return {
      success: false,
      exitCode: null,
      stdout: result.output,
      stderr: timeoutMatch[2] ?? "",
      timedOut: true,
      errorSummary: result.error,
    };
  }

  return {
    success: false,
    exitCode: null,
    stdout: result.output,
    stderr: "",
    timedOut: false,
    errorSummary: result.error,
  };
}

export async function executeBridgeRun(
  target: BridgeTargetConfig,
  actionName: string,
  args: unknown,
  cwd: unknown,
  timeoutMs: unknown,
  context: ToolContext,
): Promise<ToolCallResult> {
  if (target.transport === "mcp") {
    return executeBridgeMcpRun(target, actionName, args, cwd, timeoutMs, context);
  }

  const start = Date.now();
  const runId = crypto.randomUUID();
  const name = "bridge_run";

  try {
    const { commandPreview } = buildBridgeCommandTokens(target, actionName, args);
    const resolvedCwd = resolveBridgeWorkingDirectory(target, cwd, context);
    const effectiveTimeoutMs = resolveBridgeTimeoutMs(target, timeoutMs, context);
    const bridgeSubtask = resolveBridgeSubtaskSemantics(context, target.id, actionName);
    const runResult = await runCommandTool.execute({
      command: commandPreview,
      ...(resolvedCwd ? { cwd: resolvedCwd } : {}),
      ...(effectiveTimeoutMs ? { timeoutMs: effectiveTimeoutMs } : {}),
    }, context);
    const parsed = parseRunCommandResult(runResult);
    const output = clampBridgeOutput(target, parsed.stdout, parsed.stderr, context);

    const artifactSummary: BridgeRunArtifactSummary = {
      version: 1,
      runId,
      targetId: target.id,
      action: actionName,
      ...(bridgeSubtask ? { bridgeSubtask } : {}),
      success: parsed.success,
      exitCode: parsed.exitCode,
      timedOut: parsed.timedOut,
      cwd: resolvedCwd ?? context.defaultCwd ?? context.workspaceRoot,
      commandPreview,
      durationMs: Date.now() - start,
      createdAt: new Date().toISOString(),
      stdout: {
        bytes: output.stdout.bytes,
        truncated: output.stdout.truncated,
      },
      stderr: {
        bytes: output.stderr.bytes,
        truncated: output.stderr.truncated,
      },
      ...(parsed.errorSummary ? { errorSummary: parsed.errorSummary } : {}),
    };
    const artifactPath = await persistBridgeRunArtifacts(
      context,
      artifactSummary,
      output.stdout.value,
      output.stderr.value,
    );

    const payload = {
      runId,
      targetId: target.id,
      action: actionName,
      ...(bridgeSubtask ? { bridgeSubtask } : {}),
      commandPreview,
      cwd: resolvedCwd ?? context.defaultCwd ?? context.workspaceRoot,
      exitCode: parsed.exitCode,
      stdout: output.stdout.value,
      stderr: output.stderr.value,
      timedOut: parsed.timedOut,
      durationMs: Date.now() - start,
      artifactPath,
    };

    return {
      id: runId,
      name,
      success: parsed.success,
      output: JSON.stringify(payload, null, 2),
      error: parsed.success ? undefined : (parsed.errorSummary ?? "Bridge run failed."),
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      id: runId,
      name,
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}
