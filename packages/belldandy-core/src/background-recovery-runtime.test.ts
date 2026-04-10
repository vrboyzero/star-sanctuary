import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BackgroundContinuationLedger } from "./background-continuation-runtime.js";
import {
  BackgroundRecoveryRuntime,
  buildBackgroundRecoveryFingerprint,
} from "./background-recovery-runtime.js";

describe("background recovery runtime", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("records successful heartbeat recovery and tags the recovery run", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-background-recovery-"));
    tempDirs.push(stateDir);
    const ledger = new BackgroundContinuationLedger(stateDir);
    const failed = await ledger.finishRun({
      runId: "heartbeat-run-1",
      kind: "heartbeat",
      sourceId: "heartbeat",
      label: "Heartbeat",
      status: "failed",
      reason: "network timeout",
      startedAt: Date.now() - 1_000,
      finishedAt: Date.now() - 500,
    });
    const recoverHeartbeat = vi.fn(async () => {
      await ledger.finishRun({
        runId: "heartbeat-run-2",
        kind: "heartbeat",
        sourceId: "heartbeat",
        label: "Heartbeat",
        status: "ran",
        summary: "heartbeat recovered",
        startedAt: Date.now() - 200,
        finishedAt: Date.now() - 100,
      });
      return {
        status: "ran" as const,
        runId: "heartbeat-run-2",
        message: "heartbeat recovered",
      };
    });
    const runtime = new BackgroundRecoveryRuntime({
      ledger,
      recoverHeartbeat,
      throttleMs: 60_000,
    });

    const result = await runtime.maybeRecover(failed);
    expect(result).toMatchObject({
      outcome: "succeeded",
      recoveryRunId: "heartbeat-run-2",
    });
    expect(recoverHeartbeat).toHaveBeenCalledTimes(1);

    const entries = await ledger.listRecent(4);
    const failedEntry = entries.find((item) => item.runId === "heartbeat-run-1");
    const recoveryEntry = entries.find((item) => item.runId === "heartbeat-run-2");
    expect(failedEntry).toMatchObject({
      latestRecoveryOutcome: "succeeded",
      latestRecoveryRunId: "heartbeat-run-2",
      recoveryAttemptCount: 1,
    });
    expect(recoveryEntry).toMatchObject({
      recoveredFromRunId: "heartbeat-run-1",
      latestRecoveryOutcome: "succeeded",
    });

    const throttled = await runtime.maybeRecover(failedEntry!);
    expect(throttled.outcome).toBe("throttled");
    expect(recoverHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("throttles repeated cron recovery for the same source and fingerprint", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-background-recovery-"));
    tempDirs.push(stateDir);
    const ledger = new BackgroundContinuationLedger(stateDir);
    const firstFailed = await ledger.finishRun({
      runId: "cron-run-1",
      kind: "cron",
      sourceId: "cron-job-1",
      label: "Digest",
      status: "failed",
      reason: "delivery failed",
      startedAt: Date.now() - 3_000,
      finishedAt: Date.now() - 2_000,
    });
    const fingerprint = buildBackgroundRecoveryFingerprint(firstFailed);
    await ledger.recordRecovery({
      runId: firstFailed.runId,
      outcome: "failed",
      reason: "first recovery failed",
      recoveryRunId: "cron-run-2",
      fingerprint,
    });
    const secondFailed = await ledger.finishRun({
      runId: "cron-run-3",
      kind: "cron",
      sourceId: "cron-job-1",
      label: "Digest",
      status: "failed",
      reason: "delivery failed",
      startedAt: Date.now() - 1_000,
      finishedAt: Date.now() - 500,
    });
    const recoverCron = vi.fn(async () => ({
      status: "ok" as const,
      runId: "cron-run-4",
      summary: "digest recovered",
    }));
    const runtime = new BackgroundRecoveryRuntime({
      ledger,
      recoverCron,
      throttleMs: 60_000,
    });

    const result = await runtime.maybeRecover(secondFailed);
    expect(result).toMatchObject({
      outcome: "throttled",
    });
    expect(recoverCron).not.toHaveBeenCalled();

    const entries = await ledger.listRecent(4);
    expect(entries.find((item) => item.runId === "cron-run-3")).toMatchObject({
      latestRecoveryOutcome: "throttled",
      latestRecoveryFingerprint: fingerprint,
    });
  });
});
