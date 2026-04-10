import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import doctorCommand from "./doctor.js";
import { RuntimeResilienceTracker } from "../../runtime-resilience.js";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: execFileSyncMock,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  execFileSyncMock.mockReset();
});

test("bdd doctor json output includes tool behavior observability", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-doctor-"));
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const previous = process.env.BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS;
  process.env.BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS = "apply_patch";

  try {
    await doctorCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
      },
    } as never);

    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    expect(parsed.toolBehaviorObservability).toMatchObject({
      counts: {
        includedContractCount: expect.any(Number),
      },
      included: expect.arrayContaining([
        "run_command",
        "apply_patch",
        "delegate_task",
      ]),
      experiment: {
        disabledContractNamesConfigured: ["apply_patch"],
        disabledContractNamesApplied: ["apply_patch"],
      },
    });
    expect(parsed.toolBehaviorObservability.contracts.run_command).toMatchObject({
      useWhen: expect.any(Array),
      preflightChecks: expect.any(Array),
    });
    expect(parsed.toolContractV2Observability).toMatchObject({
      summary: {
        totalCount: expect.any(Number),
        highRiskCount: expect.any(Number),
        confirmRequiredCount: expect.any(Number),
      },
    });
    expect(parsed.toolContractV2Observability.summary.totalCount).toBeGreaterThanOrEqual(6);
    expect(parsed.toolContractV2Observability.summary.highRiskCount).toBeGreaterThanOrEqual(4);
    expect(parsed.toolContractV2Observability.summary.confirmRequiredCount).toBeGreaterThanOrEqual(4);
    expect(parsed.residentAgents).toMatchObject({
      summary: {
        totalCount: 1,
        idleCount: 1,
        runningCount: 0,
        digestMissingCount: 0,
        memoryModeCounts: {
          hybrid: 1,
        },
      },
      agents: [
        expect.objectContaining({
          id: "default",
          memoryMode: "hybrid",
          observabilityHeadline: expect.stringContaining("write=private"),
        }),
      ],
    });
  } finally {
    if (previous === undefined) {
      delete process.env.BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS;
    } else {
      process.env.BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS = previous;
    }
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd doctor accepts pnpm resolved via corepack", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-doctor-corepack-"));
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  execFileSyncMock.mockImplementation((file: string, args: string[]) => {
    if ((file === "pnpm.cmd" || file === "pnpm") && Array.isArray(args) && args.join(" ") === "--version") {
      throw new Error("pnpm not found");
    }
    if ((file === "corepack.cmd" || file === "corepack") && Array.isArray(args) && args.join(" ") === "pnpm --version") {
      return "10.11.1\n";
    }
    throw new Error(`unexpected command: ${file} ${Array.isArray(args) ? args.join(" ") : ""}`);
  });

  try {
    await doctorCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
      },
    } as never);

    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    const pnpmCheck = parsed.checks.find((item: { name: string }) => item.name === "pnpm");
    expect(pnpmCheck).toMatchObject({
      status: "pass",
      message: "v10.11.1 (via corepack)",
    });
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd doctor json output includes deployment backend summary", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-doctor-deployment-"));
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  await fs.writeFile(path.join(stateDir, "deployment-backends.json"), `${JSON.stringify({
    version: 1,
    selectedProfileId: "docker-main",
    profiles: [
      {
        id: "local-default",
        backend: "local",
        enabled: true,
        workspace: {
          mode: "direct",
        },
        credentials: {
          mode: "inherit_env",
        },
        observability: {
          logMode: "local",
        },
      },
      {
        id: "docker-main",
        backend: "docker",
        enabled: true,
        runtime: {
          service: "belldandy-gateway",
        },
        workspace: {
          mode: "mount",
          remotePath: "/workspace",
        },
        credentials: {
          mode: "env_file",
          ref: ".env.deploy",
        },
        observability: {
          logMode: "docker",
        },
      },
    ],
  }, null, 2)}\n`);

  try {
    await doctorCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
      },
    } as never);

    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    expect(parsed.deploymentBackends).toMatchObject({
      configExists: true,
      summary: {
        profileCount: 2,
        enabledCount: 2,
        warningCount: 0,
        selectedProfileId: "docker-main",
        selectedResolved: true,
        selectedBackend: "docker",
        backendCounts: {
          local: 1,
          docker: 1,
          ssh: 0,
        },
      },
    });
    const deploymentCheck = parsed.checks.find((item: { name: string }) => item.name === "Deployment Backends");
    expect(deploymentCheck).toMatchObject({
      status: "pass",
    });
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd doctor json output includes runtime resilience summary when available", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-doctor-runtime-"));
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const tracker = new RuntimeResilienceTracker({
    stateDir,
    routing: {
      primary: {
        profileId: "primary",
        provider: "openai.com",
        model: "gpt-4.1",
      },
      fallbacks: [
        {
          profileId: "backup",
          provider: "moonshot.ai",
          model: "kimi-k2",
        },
      ],
      compaction: {
        configured: true,
        sharesPrimaryRoute: false,
        route: {
          profileId: "compaction",
          provider: "openai.com",
          model: "gpt-4.1-mini",
        },
      },
    },
  });
  tracker.record({
    source: "openai_chat",
    phase: "primary_chat",
    conversationId: "conv-runtime-doctor",
    summary: {
      configuredProfiles: [
        { profileId: "primary", provider: "openai.com", model: "gpt-4.1" },
        { profileId: "backup", provider: "moonshot.ai", model: "kimi-k2" },
      ],
      finalStatus: "success",
      finalProfileId: "backup",
      finalProvider: "moonshot.ai",
      finalModel: "kimi-k2",
      requestCount: 2,
      failedStageCount: 1,
      degraded: true,
      stepCounts: {
        cooldownSkips: 0,
        sameProfileRetries: 1,
        crossProfileFallbacks: 1,
        terminalFailures: 0,
      },
      reasonCounts: {
        server_error: 1,
      },
      steps: [],
      startedAt: Date.now() - 500,
      updatedAt: Date.now(),
      durationMs: 500,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  try {
    await doctorCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
      },
    } as never);

    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    expect(parsed.runtimeResilience).toMatchObject({
      routing: {
        primary: {
          provider: "openai.com",
          model: "gpt-4.1",
        },
      },
      latest: {
        finalStatus: "success",
        finalProfileId: "backup",
        degraded: true,
      },
    });
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
