import { describe, expect, it } from "vitest";

import { renderPromptSnapshotDetail } from "./prompt-snapshot-detail.js";

describe("prompt snapshot detail rendering", () => {
  it("renders sidecar summaries inside the snapshot detail block", () => {
    const html = renderPromptSnapshotDetail({
      snapshot: {
        manifest: {
          conversationId: "sub_task_1",
          runId: "run-1",
          agentId: "coder",
          createdAt: 1712000000000,
        },
        summary: {
          messageCount: 2,
          deltaCount: 1,
          providerNativeSystemBlockCount: 1,
          tokenBreakdown: {
            systemPromptEstimatedTokens: 88,
          },
        },
        snapshot: {
          systemPrompt: "Follow the repo conventions.",
          messages: [
            { role: "system", content: "Follow the repo conventions." },
            { role: "user", content: "Ship the patch." },
          ],
        },
      },
      residentStateBinding: {
        workspaceScopeSummary: "custom workspace scope (repo-a) rooted at E:/state/workspaces/repo-a",
        stateScopeSummary: "private=E:/state/workspaces/repo-a/agents/coder; sessions=E:/state/workspaces/repo-a/agents/coder/sessions; shared=E:/state/workspaces/repo-a/team-memory",
      },
      launchExplainability: {
        catalogDefault: {
          role: "coder",
          permissionMode: "confirm",
          allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
          maxToolRiskLevel: "high",
          handoffStyle: "structured",
        },
        effectiveLaunch: {
          source: "catalog_default",
          agentId: "coder",
          profileId: "coder",
          role: "coder",
          permissionMode: "confirm",
          allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
          maxToolRiskLevel: "high",
          handoffStyle: "structured",
        },
      },
    }, {
      escapeHtml: (value) => String(value),
      formatDateTime: (value) => String(value),
      t: (_key, _params, fallback) => fallback,
      sessionId: "sub_task_1",
    });

    expect(html).toContain("Prompt Snapshot");
    expect(html).toContain("custom workspace scope (repo-a) rooted at E:/state/workspaces/repo-a");
    expect(html).toContain("catalog default: role=coder");
    expect(html).toContain("effective launch: source=catalog_default, agent=coder");
    expect(html).toContain("Follow the repo conventions.");
    expect(html).toContain("#1 system");
    expect(html).toContain('data-subtask-prompt-snapshot-session="sub_task_1"');
  });
});
