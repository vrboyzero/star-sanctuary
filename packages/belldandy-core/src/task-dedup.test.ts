import { describe, expect, it } from "vitest";

import {
  buildToolActionKey,
  buildWarnOnlyDuplicateNotice,
  parseToolDedupGlobalMode,
  parseToolDedupPolicy,
  resolveToolDedupMode,
  summarizeToolDedupPolicy,
  shouldBypassToolDedup,
} from "./task-dedup.js";

describe("task dedup policy", () => {
  it("classifies tools into graded dedup modes", () => {
    expect(resolveToolDedupMode("service_restart")).toBe("hard-block");
    expect(resolveToolDedupMode("switch_facet")).toBe("hard-block");
    expect(resolveToolDedupMode("method_create")).toBe("hard-block");
    expect(resolveToolDedupMode("run_command")).toBe("warn-only");
    expect(resolveToolDedupMode("file_write")).toBe("warn-only");
    expect(resolveToolDedupMode("file_delete")).toBe("warn-only");
    expect(resolveToolDedupMode("memory_search")).toBe("off");
  });

  it("builds stable action keys for high-risk and warn-only tools", () => {
    expect(buildToolActionKey("service_restart", {})).toBe("service_restart:gateway");
    expect(buildToolActionKey("run_command", { command: "pnpm   build;" })).toBe("command:pnpm build");
    expect(buildToolActionKey("file_write", { path: "src\\app.ts" })).toBe("file_write:path:src/app.ts");
    expect(buildToolActionKey("method_create", { filename: "deploy.md" })).toBe("method_create:file:deploy.md");
  });

  it("supports explicit bypass flags", () => {
    expect(shouldBypassToolDedup({})).toBe(false);
    expect(shouldBypassToolDedup({ retry: true })).toBe(true);
    expect(shouldBypassToolDedup({ force: true })).toBe(true);
    expect(shouldBypassToolDedup({ allowDuplicate: true })).toBe(true);
  });

  it("builds a concise synthetic notice for warn-only duplicate actions", () => {
    const notice = buildWarnOnlyDuplicateNotice({
      toolName: "run_command",
      actionKey: "command:pnpm build",
      finishedAt: "2026-03-18T10:00:00.000Z",
      taskLabel: "build web bundle",
      withinMinutes: 20,
    });

    expect(notice).toContain('Tool "run_command" matched a recently completed action.');
    expect(notice).toContain("retry=true");
    expect(notice).toContain("command:pnpm build");
  });

  it("parses configurable global mode and per-tool policy overrides", () => {
    expect(parseToolDedupGlobalMode(undefined)).toBe("graded");
    expect(parseToolDedupGlobalMode("strict")).toBe("strict");
    expect(parseToolDedupGlobalMode("off")).toBe("off");
    expect(parseToolDedupGlobalMode("invalid")).toBe("graded");

    const policy = parseToolDedupPolicy("run_command:off,file_write:hard-block,broken,service_restart:warn-only");
    expect(policy).toEqual({
      run_command: "off",
      file_write: "hard-block",
      service_restart: "warn-only",
    });
  });

  it("applies strict mode and policy overrides deterministically", () => {
    expect(resolveToolDedupMode("run_command", { globalMode: "strict" })).toBe("hard-block");
    expect(resolveToolDedupMode("memory_search", { globalMode: "strict" })).toBe("off");
    expect(resolveToolDedupMode("run_command", {
      globalMode: "strict",
      policy: { run_command: "off" },
    })).toBe("off");
    expect(summarizeToolDedupPolicy({
      globalMode: "graded",
      policy: { run_command: "warn-only", file_write: "hard-block" },
    })).toContain("file_write:hard-block");
  });
});
