import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMemoryModule() {
  vi.resetModules();
  vi.doMock("@belldandy/memory", () => ({
    MemoryManager: vi.fn(),
    getGlobalMemoryManager: () => null,
    createTaskWorkSurface: () => ({
      recentWork: () => [],
      resumeContext: () => null,
      findSimilarWork: () => [],
      explainSources: () => null,
    }),
    appendToTodayMemory: vi.fn(),
    readMemoryFile: vi.fn(),
    writeMemoryFile: vi.fn(),
  }));
  vi.doMock("../skill-publisher.js", () => ({
    publishSkillCandidate: vi.fn(),
  }));
  vi.doMock("../skill-registry.js", () => ({
    getGlobalSkillRegistry: vi.fn(() => null),
  }));
  return import("./memory.js");
}

describe("memory tool confirmation policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("applies generation confirmation envs to method and skill promotion tools", async () => {
    vi.stubEnv("BELLDANDY_METHOD_GENERATION_CONFIRM_REQUIRED", "true");
    vi.stubEnv("BELLDANDY_SKILL_GENERATION_CONFIRM_REQUIRED", "1");

    const mod = await loadMemoryModule();

    expect(mod.taskPromoteMethodTool.contract.needsPermission).toBe(true);
    expect(mod.taskPromoteSkillDraftTool.contract.needsPermission).toBe(true);
  });

  it("applies publish confirmation envs to experience candidate accept tool", async () => {
    vi.stubEnv("BELLDANDY_METHOD_PUBLISH_CONFIRM_REQUIRED", "true");

    const mod = await loadMemoryModule();

    expect(mod.experienceCandidateAcceptTool.contract.needsPermission).toBe(true);
  });
});
