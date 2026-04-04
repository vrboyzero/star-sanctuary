import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import doctorCommand from "./doctor.js";

afterEach(() => {
  vi.restoreAllMocks();
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
  } finally {
    if (previous === undefined) {
      delete process.env.BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS;
    } else {
      process.env.BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS = previous;
    }
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
