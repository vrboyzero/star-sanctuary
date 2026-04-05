import { describe, expect, it } from "vitest";

import {
  formatResidentSourceAuditSummary,
  formatResidentSourceConflictSummary,
  formatResidentSourceExplainability,
  formatResidentSourceScopeLabel,
  formatResidentSourceSummary,
  getResidentSourceBadgeClass,
  normalizeResidentSourceScope,
} from "./memory-source-view.js";

describe("memory source view formatting", () => {
  it("normalizes scope values and returns badge classes", () => {
    expect(normalizeResidentSourceScope("shared")).toBe("shared");
    expect(normalizeResidentSourceScope("hybrid")).toBe("hybrid");
    expect(normalizeResidentSourceScope("unknown")).toBe("private");

    expect(getResidentSourceBadgeClass({ scope: "shared" })).toBe("memory-badge-shared");
    expect(getResidentSourceBadgeClass({ scope: "hybrid" })).toBe("memory-badge-hybrid");
    expect(getResidentSourceBadgeClass({ scope: "private" })).toBe("memory-badge-private");
  });

  it("formats labels and summaries for UI badges", () => {
    expect(formatResidentSourceScopeLabel({ scope: "hybrid" })).toBe("hybrid");
    expect(formatResidentSourceSummary({ scope: "hybrid" })).toContain("private + shared");
    expect(formatResidentSourceSummary({ scope: "shared", summary: "shared 来源（2 条）" })).toBe("shared 来源（2 条）");
  });

  it("formats explainability, conflict, and audit summaries", () => {
    const sourceView = {
      scope: "shared",
      explainability: {
        code: "shared_approved_shared",
        governanceStatus: "approved",
        privateCount: 1,
        sharedCount: 1,
        requestedByAgentId: "coder",
        reviewerAgentId: "reviewer",
        claimedByAgentId: "reviewer",
        claimedAt: "2026-04-05T00:02:00.000Z",
        reason: "share it",
      },
    };

    expect(formatResidentSourceExplainability(sourceView)).toContain("审批已通过");
    expect(formatResidentSourceConflictSummary(sourceView)).toContain("同时命中 private 1 条与 shared 1 条");
    expect(formatResidentSourceAuditSummary(sourceView)).toContain("status=approved");
    expect(formatResidentSourceAuditSummary(sourceView)).toContain("requestedBy=coder");
    expect(formatResidentSourceAuditSummary(sourceView)).toContain("claimedBy=reviewer");
  });
});
