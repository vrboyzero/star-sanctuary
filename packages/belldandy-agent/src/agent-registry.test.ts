import { expect, test } from "vitest";

import type { AgentProfile } from "./agent-profile.js";
import { AgentRegistry } from "./agent-registry.js";
import type { BelldandyAgent } from "./index.js";

function createStubAgent(label: string): BelldandyAgent {
  return {
    async *run() {
      yield { type: "final", text: label } as const;
    },
  };
}

function profile(model: string): AgentProfile {
  return {
    id: "default",
    displayName: "Default",
    model,
  };
}

test("AgentRegistry caches instances by agent + modelRef and forwards modelOverride", () => {
  const calls: Array<{ profileId: string; modelOverride?: string }> = [];
  const registry = new AgentRegistry((p, opts) => {
    calls.push({ profileId: p.id, modelOverride: opts?.modelOverride });
    return createStubAgent(`${p.id}:${opts?.modelOverride ?? p.model}`);
  });
  registry.register(profile("primary"));

  const defaultA = registry.create("default");
  const defaultB = registry.create("default");
  const kimiA = registry.create("default", { modelOverride: "kimi-k2.5" });
  const kimiB = registry.create("default", { modelOverride: "kimi-k2.5" });
  const opus = registry.create("default", { modelOverride: "claude-opus" });

  expect(defaultA).toBe(defaultB);
  expect(kimiA).toBe(kimiB);
  expect(defaultA).not.toBe(kimiA);
  expect(kimiA).not.toBe(opus);
  expect(calls).toEqual([
    { profileId: "default", modelOverride: undefined },
    { profileId: "default", modelOverride: "kimi-k2.5" },
    { profileId: "default", modelOverride: "claude-opus" },
  ]);
});

test("clearInstance clears all cached model variants for the same agent", () => {
  const registry = new AgentRegistry((p, opts) => createStubAgent(`${p.id}:${opts?.modelOverride ?? p.model}`));
  registry.register(profile("primary"));

  const defaultA = registry.create("default");
  const kimiA = registry.create("default", { modelOverride: "kimi-k2.5" });
  registry.clearInstance("default");

  const defaultB = registry.create("default");
  const kimiB = registry.create("default", { modelOverride: "kimi-k2.5" });

  expect(defaultA).not.toBe(defaultB);
  expect(kimiA).not.toBe(kimiB);
});
