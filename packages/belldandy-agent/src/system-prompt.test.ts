import { describe, expect, it } from "vitest";

import { buildProviderNativeSystemBlocks, buildSystemPrompt, buildSystemPromptResult, buildWorkspaceContext, renderSystemPromptSections } from "./system-prompt.js";
import { parseWorkspaceDocument, type WorkspaceFile, type WorkspaceFileName, type WorkspaceLoadResult } from "./workspace.js";

const baseWorkspace = {
  dir: "/workspace",
  hasSoul: true,
  hasIdentity: true,
  hasUser: true,
  hasBootstrap: false,
  hasAgents: true,
  hasTools: true,
  hasHeartbeat: false,
  hasMemory: false,
};

function createWorkspaceFile(name: "AGENTS.md" | "SOUL.md" | "TOOLS.md" | "IDENTITY.md" | "USER.md" | "BOOTSTRAP.md" | "MEMORY.md", content: string) {
  return {
    name,
    path: `/workspace/${name}`,
    content,
    document: parseWorkspaceDocument(content),
    missing: false as const,
  };
}

function createMissingWorkspaceFile(name: WorkspaceFileName): WorkspaceFile {
  return {
    name,
    path: `/workspace/${name}`,
    missing: true,
  };
}

describe("system prompt sections", () => {
  it("returns structured sections and preserves legacy string output", () => {
    const result = buildSystemPromptResult({
      workspace: {
        files: [
          createWorkspaceFile("AGENTS.md", "# agents"),
          createWorkspaceFile("SOUL.md", "# soul"),
          createWorkspaceFile("TOOLS.md", "# tools"),
          createWorkspaceFile("IDENTITY.md", "# identity"),
          createWorkspaceFile("USER.md", "# user"),
          createMissingWorkspaceFile("HEARTBEAT.md"),
          createMissingWorkspaceFile("BOOTSTRAP.md"),
          createMissingWorkspaceFile("MEMORY.md"),
        ],
        ...baseWorkspace,
      },
      extraSystemPrompt: "extra rules",
      hasSearchableSkills: true,
      skillInstructions: [{ name: "skill-a", instructions: "do the thing" }],
      currentTime: "2026-04-03T00:00:00.000Z",
      userTimezone: "Asia/Shanghai",
    });

    expect(result.sections.map((section) => section.id)).toEqual(expect.arrayContaining([
      "core",
      "workspace-agents",
      "workspace-soul",
      "workspace-user",
      "workspace-identity",
      "workspace-tools",
      "skills",
      "context",
      "extra",
      "methodology",
      "workspace-dir",
    ]));
    expect(result.droppedSections).toHaveLength(0);
    expect(result.text).toBe(renderSystemPromptSections(result.sections));
    expect(buildSystemPrompt({
      workspace: {
        files: [
          createWorkspaceFile("AGENTS.md", "# agents"),
          createWorkspaceFile("SOUL.md", "# soul"),
          createWorkspaceFile("TOOLS.md", "# tools"),
          createWorkspaceFile("IDENTITY.md", "# identity"),
          createWorkspaceFile("USER.md", "# user"),
          createMissingWorkspaceFile("HEARTBEAT.md"),
          createMissingWorkspaceFile("BOOTSTRAP.md"),
          createMissingWorkspaceFile("MEMORY.md"),
        ],
        ...baseWorkspace,
      },
      extraSystemPrompt: "extra rules",
      hasSearchableSkills: true,
      skillInstructions: [{ name: "skill-a", instructions: "do the thing" }],
      currentTime: "2026-04-03T00:00:00.000Z",
      userTimezone: "Asia/Shanghai",
    })).toBe(result.text);
  });

  it("reports dropped sections when truncation removes low-priority sections", () => {
    const result = buildSystemPromptResult({
      workspace: {
        files: [
          createWorkspaceFile("AGENTS.md", "A".repeat(200)),
          createWorkspaceFile("SOUL.md", "B".repeat(200)),
          createWorkspaceFile("TOOLS.md", "C".repeat(200)),
          createWorkspaceFile("IDENTITY.md", "D".repeat(200)),
          createWorkspaceFile("USER.md", "E".repeat(200)),
          createMissingWorkspaceFile("HEARTBEAT.md"),
          createMissingWorkspaceFile("BOOTSTRAP.md"),
          createWorkspaceFile("MEMORY.md", "F".repeat(200)),
        ],
        ...baseWorkspace,
        hasMemory: true,
      },
      maxChars: 100,
    });

    expect(result.truncated).toBe(true);
    expect(result.droppedSections.length).toBeGreaterThan(0);
    expect(result.sections[result.sections.length - 1]?.id).toBe("truncation-notice");
    expect(result.text).toContain("System prompt truncated");
  });

  it("applies section priority overrides before truncation", () => {
    const result = buildSystemPromptResult({
      workspace: {
        files: [
          createMissingWorkspaceFile("AGENTS.md"),
          createMissingWorkspaceFile("SOUL.md"),
          createMissingWorkspaceFile("TOOLS.md"),
          createMissingWorkspaceFile("IDENTITY.md"),
          createMissingWorkspaceFile("USER.md"),
          createMissingWorkspaceFile("HEARTBEAT.md"),
          createMissingWorkspaceFile("BOOTSTRAP.md"),
          createMissingWorkspaceFile("MEMORY.md"),
        ],
        ...baseWorkspace,
        hasSoul: false,
        hasIdentity: false,
        hasUser: false,
        hasAgents: false,
        hasTools: false,
      },
      extraSystemPrompt: "X".repeat(2000),
      currentTime: "2026-04-03T00:00:00.000Z",
      userTimezone: "Asia/Shanghai",
      maxChars: 1800,
      sectionPriorityOverrides: {
        methodology: 5,
      },
    });

    expect(result.sections.map((section) => section.id)).toEqual([
      "core",
      "methodology",
      "context",
      "truncation-notice",
    ]);
    expect(result.droppedSections.map((section) => section.id)).toEqual([
      "extra",
      "workspace-dir",
    ]);
  });

  it("strips frontmatter from workspace prompt bodies and exposes section metadata", () => {
    const agentsContent = [
      "---",
      "summary: \"workspace guide\"",
      "read_when:",
      "  - session start",
      "  - when rules change",
      "layer: core",
      "cache: sticky",
      "role: system",
      "---",
      "# agents body",
    ].join("\n");

    const result = buildSystemPromptResult({
      workspace: {
        files: [
          createWorkspaceFile("AGENTS.md", agentsContent),
          createWorkspaceFile("SOUL.md", "# soul"),
          createWorkspaceFile("TOOLS.md", "# tools"),
          createWorkspaceFile("IDENTITY.md", "# identity"),
          createWorkspaceFile("USER.md", "# user"),
          createMissingWorkspaceFile("HEARTBEAT.md"),
          createMissingWorkspaceFile("BOOTSTRAP.md"),
          createMissingWorkspaceFile("MEMORY.md"),
        ],
        ...baseWorkspace,
      },
    });

    const agentsSection = result.sections.find((section) => section.id === "workspace-agents");
    expect(agentsSection).toMatchObject({
      sourceFile: "/workspace/AGENTS.md",
      summary: "workspace guide",
      readWhen: ["session start", "when rules change"],
      layer: "core",
      cacheHint: "sticky",
      role: "system",
    });
    expect(agentsSection?.text).toContain("# agents body");
    expect(agentsSection?.text).not.toContain('summary: "workspace guide"');
    expect(result.text).not.toContain("read_when:");
  });

  it("builds workspace context from stripped prompt bodies", () => {
    const workspace: WorkspaceLoadResult = {
      files: [
        createWorkspaceFile("AGENTS.md", ["---", "summary: \"guide\"", "---", "# agents body"].join("\n")),
        createWorkspaceFile("SOUL.md", "# soul body"),
        createMissingWorkspaceFile("TOOLS.md"),
        createMissingWorkspaceFile("IDENTITY.md"),
        createMissingWorkspaceFile("USER.md"),
        createMissingWorkspaceFile("HEARTBEAT.md"),
        createMissingWorkspaceFile("BOOTSTRAP.md"),
        createMissingWorkspaceFile("MEMORY.md"),
      ],
      ...baseWorkspace,
      hasSoul: true,
      hasIdentity: false,
      hasUser: false,
      hasAgents: true,
      hasTools: false,
    };

    const context = buildWorkspaceContext(workspace);
    expect(context).toContain("## AGENTS.md");
    expect(context).toContain("# agents body");
    expect(context).not.toContain('summary: "guide"');
  });

  it("builds provider-native system blocks from sections and system deltas", () => {
    const result = buildSystemPromptResult({
      workspace: {
        files: [
          createWorkspaceFile("AGENTS.md", "# agents"),
          createWorkspaceFile("SOUL.md", "# soul"),
          createWorkspaceFile("TOOLS.md", "# tools"),
          createWorkspaceFile("IDENTITY.md", "# identity"),
          createWorkspaceFile("USER.md", "# user"),
          createMissingWorkspaceFile("HEARTBEAT.md"),
          createMissingWorkspaceFile("BOOTSTRAP.md"),
          createMissingWorkspaceFile("MEMORY.md"),
        ],
        ...baseWorkspace,
      },
      extraSystemPrompt: "extra rules",
      hasSearchableSkills: true,
      currentTime: "2026-04-03T00:00:00.000Z",
      userTimezone: "Asia/Shanghai",
    });

    const blocks = buildProviderNativeSystemBlocks({
      sections: result.sections,
      deltas: [
        {
          id: "runtime-identity",
          deltaType: "runtime-identity",
          role: "system",
          text: "## runtime identity",
        },
        {
          id: "recent-memory",
          deltaType: "user-prelude",
          role: "user-prelude",
          text: "<recent-memory>ctx</recent-memory>",
        },
      ],
    });

    expect(blocks.map((block) => block.blockType)).toEqual([
      "static-persona",
      "static-capability",
      "dynamic-runtime",
    ]);
    expect(blocks[0]).toMatchObject({
      id: "provider-native-static-persona",
      sourceSectionIds: expect.arrayContaining(["core", "workspace-agents", "workspace-soul", "workspace-user", "workspace-identity"]),
      cacheControlEligible: true,
    });
    expect(blocks[1]).toMatchObject({
      id: "provider-native-static-capability",
      sourceSectionIds: expect.arrayContaining(["workspace-tools", "skills", "context", "extra", "methodology", "workspace-dir"]),
      cacheControlEligible: true,
    });
    expect(blocks[2]).toMatchObject({
      id: "provider-native-dynamic-runtime",
      sourceDeltaIds: ["runtime-identity"],
      cacheControlEligible: false,
    });
    expect(blocks[2]?.text).toContain("## runtime identity");
    expect(blocks[2]?.text).not.toContain("<recent-memory>");
  });
});
