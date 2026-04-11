import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import { MemoryRuntimeUsageAccounting } from "./memory-runtime-budget.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("MemoryRuntimeUsageAccounting falls back to direct write on win32 rename EPERM", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-budget-"));
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

  Object.defineProperty(process, "platform", {
    configurable: true,
    value: "win32",
  });

  const renameSpy = vi.spyOn(fs, "rename").mockRejectedValue(Object.assign(new Error("locked"), {
    code: "EPERM",
  }));

  try {
    const accounting = new MemoryRuntimeUsageAccounting({ stateDir });
    await accounting.recordEvent({
      consumer: "durable_extraction_request",
      outcome: "blocked",
      timestamp: 1_775_904_602_960,
      metadata: {
        reasonCode: "durable_extraction_request_budget_exceeded",
      },
    });

    const stored = JSON.parse(
      await fs.readFile(path.join(stateDir, "memory-runtime", "usage-accounting.json"), "utf-8"),
    ) as {
      version: number;
      events: Array<{ consumer: string; outcome: string; metadata?: Record<string, unknown> }>;
    };

    expect(renameSpy).toHaveBeenCalledTimes(3);
    expect(stored.version).toBe(1);
    expect(stored.events).toEqual([
      expect.objectContaining({
        consumer: "durable_extraction_request",
        outcome: "blocked",
        metadata: {
          reasonCode: "durable_extraction_request_budget_exceeded",
        },
      }),
    ]);
  } finally {
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
