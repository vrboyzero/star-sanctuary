import type { GatewayReqFrame, GatewayResFrame } from "@belldandy/protocol";

import type { GatewayWebSocketRequestContext } from "../server-websocket-dispatch.js";

type CronRuntimeMethodContext = Pick<
  GatewayWebSocketRequestContext,
  "runCronJobNow" | "runCronRecovery"
>;

function parseCronJobIdParams(
  method: "cron.run_now" | "cron.recovery.run",
  value: unknown,
): { ok: true; value: { jobId: string } } | { ok: false; message: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, message: `${method} params must be an object.` };
  }
  const jobId = typeof (value as { jobId?: unknown }).jobId === "string"
    ? (value as { jobId: string }).jobId.trim()
    : "";
  if (!jobId) {
    return { ok: false, message: `${method} requires a non-empty jobId.` };
  }
  return {
    ok: true,
    value: { jobId },
  };
}

export async function handleCronRuntimeMethod(
  req: GatewayReqFrame,
  ctx: CronRuntimeMethodContext,
): Promise<GatewayResFrame | null> {
  if (req.method !== "cron.run_now" && req.method !== "cron.recovery.run") {
    return null;
  }

  const parsed = parseCronJobIdParams(req.method, req.params);
  if (!parsed.ok) {
    return {
      type: "res",
      id: req.id,
      ok: false,
      error: {
        code: "invalid_params",
        message: parsed.message,
      },
    };
  }

  if (req.method === "cron.run_now") {
    if (!ctx.runCronJobNow) {
      return {
        type: "res",
        id: req.id,
        ok: false,
        error: {
          code: "cron_runtime_unavailable",
          message: "Cron runtime is not available.",
        },
      };
    }

    const result = await ctx.runCronJobNow(parsed.value.jobId);
    return {
      type: "res",
      id: req.id,
      ok: true,
      payload: {
        jobId: parsed.value.jobId,
        status: result.status,
        ...(result.runId ? { runId: result.runId } : {}),
        ...(result.summary ? { summary: result.summary } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
      },
    };
  }

  if (!ctx.runCronRecovery) {
    return {
      type: "res",
      id: req.id,
      ok: false,
      error: {
        code: "cron_recovery_unavailable",
        message: "Cron recovery runtime is not available.",
      },
    };
  }

  const result = await ctx.runCronRecovery(parsed.value.jobId);
  return {
    type: "res",
    id: req.id,
    ok: true,
    payload: {
      jobId: parsed.value.jobId,
      outcome: result.outcome,
      ...(result.sourceRunId ? { sourceRunId: result.sourceRunId } : {}),
      ...(result.recoveryRunId ? { recoveryRunId: result.recoveryRunId } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    },
  };
}
