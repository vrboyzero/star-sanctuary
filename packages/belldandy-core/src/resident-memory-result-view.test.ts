import { expect, test } from "vitest";

import type { ExperienceCandidate } from "@belldandy/memory";
import type { ResolvedResidentMemoryPolicy } from "./resident-memory-policy.js";

import {
  attachResidentExperienceCandidateSourceView,
  attachResidentExperienceUsageSourceView,
  attachResidentMemorySourceView,
  attachResidentMemorySourceViews,
  attachResidentTaskExperienceSourceView,
  buildResidentMemoryQueryView,
} from "./resident-memory-result-view.js";

const hybridPolicy: ResolvedResidentMemoryPolicy = {
  agentId: "coder",
  workspaceDir: "coder",
  memoryMode: "hybrid",
  privateStateDir: "/state/agents/coder",
  sharedStateDir: "/state/team-memory",
  managerStateDir: "/state/agents/coder",
  includeSharedMemoryReads: true,
  readTargets: ["private", "shared"],
  writeTarget: "private",
  summary: "Writes stay private; reads include both private memory and the shared team layer.",
};

test("buildResidentMemoryQueryView exposes hybrid query scope", () => {
  expect(buildResidentMemoryQueryView(hybridPolicy)).toMatchObject({
    mode: "hybrid",
    scope: "hybrid",
    writeTarget: "private",
    readTargets: ["private", "shared"],
  });
});

test("attachResidentMemorySourceView maps chunk visibility onto private/shared source scopes", () => {
  expect(attachResidentMemorySourceView({
    id: "chunk-private",
    sourcePath: "memory/private.md",
    sourceType: "manual",
    visibility: "private",
    snippet: "private",
    score: 1,
  }, hybridPolicy).sourceView).toMatchObject({
    scope: "private",
    privateCount: 1,
    explainability: {
      code: "private_only",
      governanceStatus: "none",
    },
  });

  expect(attachResidentMemorySourceView({
    id: "chunk-shared",
    sourcePath: "memory/shared.md",
    sourceType: "manual",
    visibility: "shared",
    snippet: "shared",
    score: 1,
  }, hybridPolicy).sourceView).toMatchObject({
    scope: "shared",
    sharedCount: 1,
    explainability: {
      code: "shared_only",
      governanceStatus: "none",
    },
  });
});

test("attachResidentMemorySourceViews marks mirrored private/shared promotion results with explainability", () => {
  const items = attachResidentMemorySourceViews([
    {
      id: "chunk-private",
      sourcePath: "memory/shared-source.md",
      sourceType: "manual",
      visibility: "private",
      snippet: "private",
      score: 1,
      metadata: {
        sharedPromotion: {
          kind: "manual",
          status: "approved",
          requestedAt: "2026-04-05T00:00:00.000Z",
          requestedByAgentId: "coder",
          sourceAgentId: "coder",
          sourceChunkId: "chunk-private",
          sourcePath: "memory/shared-source.md",
          sourceVisibility: "private",
          memoryMode: "hybrid",
          reason: "share it",
          targetSharedChunkId: "shared:coder:1",
          claimedByAgentId: "reviewer",
          claimedAt: "2026-04-05T00:02:00.000Z",
          reviewerAgentId: "reviewer",
          reviewedAt: "2026-04-05T00:05:00.000Z",
        },
      },
    },
    {
      id: "shared:coder:1",
      sourcePath: "memory/shared-source.md",
      sourceType: "manual",
      visibility: "shared",
      snippet: "shared",
      score: 1,
      metadata: {
        sharedPromotion: {
          kind: "manual",
          status: "approved",
          requestedAt: "2026-04-05T00:00:00.000Z",
          requestedByAgentId: "coder",
          sourceAgentId: "coder",
          sourceChunkId: "chunk-private",
          sourcePath: "memory/shared-source.md",
          sourceVisibility: "private",
          memoryMode: "hybrid",
          reason: "share it",
          targetSharedChunkId: "shared:coder:1",
          claimedByAgentId: "reviewer",
          claimedAt: "2026-04-05T00:02:00.000Z",
          reviewerAgentId: "reviewer",
          reviewedAt: "2026-04-05T00:05:00.000Z",
        },
      },
    },
  ] as any, hybridPolicy);

  expect(items[0]?.sourceView).toMatchObject({
    scope: "private",
    explainability: {
      code: "shared_approved_private",
      governanceStatus: "approved",
      privateCount: 1,
      sharedCount: 1,
      reviewerAgentId: "reviewer",
      claimedByAgentId: "reviewer",
    },
  });
  expect(items[1]?.sourceView).toMatchObject({
    scope: "shared",
    explainability: {
      code: "shared_approved_shared",
      governanceStatus: "approved",
      privateCount: 1,
      sharedCount: 1,
      reviewerAgentId: "reviewer",
      claimedByAgentId: "reviewer",
    },
  });
});

test("attachResidentExperienceCandidateSourceView summarizes mixed task memory links as hybrid", () => {
  const candidate = attachResidentExperienceCandidateSourceView({
    id: "exp_1",
    taskId: "task-1",
    type: "method",
    status: "accepted",
    title: "Candidate",
    slug: "candidate",
    content: "content",
    sourceTaskSnapshot: {
      taskId: "task-1",
      conversationId: "conv-1",
      source: "chat",
      status: "success",
      startedAt: "2026-04-05T00:00:00.000Z",
      memoryLinks: [
        { chunkId: "chunk-private", relation: "used", visibility: "private" },
        { chunkId: "chunk-shared", relation: "used", visibility: "shared" },
      ],
    },
    createdAt: "2026-04-05T00:00:00.000Z",
  }, hybridPolicy);

  expect(candidate.sourceView).toMatchObject({
    scope: "hybrid",
    privateCount: 1,
    sharedCount: 1,
    explainability: {
      code: "aggregate_mixed",
      privateCount: 1,
      sharedCount: 1,
    },
  });
  expect(candidate.sourceTaskSnapshot.memoryLinks?.[0]?.sourceView.scope).toBe("private");
  expect(candidate.sourceTaskSnapshot.memoryLinks?.[1]?.sourceView.scope).toBe("shared");
});

test("attachResidentExperienceUsageSourceView falls back to candidate source scope", () => {
  const candidate: ExperienceCandidate = {
    id: "exp_2",
    taskId: "task-2",
    type: "skill",
    status: "accepted",
    title: "Skill Candidate",
    slug: "skill-candidate",
    content: "content",
    sourceTaskSnapshot: {
      taskId: "task-2",
      conversationId: "conv-2",
      source: "chat",
      status: "success",
      startedAt: "2026-04-05T00:00:00.000Z",
      memoryLinks: [{ chunkId: "chunk-shared", relation: "used", visibility: "shared" }],
    },
    createdAt: "2026-04-05T00:00:00.000Z",
  };

  const usage = attachResidentExperienceUsageSourceView({
    id: "usage-1",
    taskId: "task-run-1",
    assetType: "skill",
    assetKey: "Skill Candidate",
    sourceCandidateId: "exp_2",
    usedVia: "tool",
    createdAt: "2026-04-05T00:01:00.000Z",
  }, candidate, hybridPolicy);

  expect(usage.sourceView).toMatchObject({
    scope: "shared",
    sharedCount: 1,
  });
});

test("attachResidentTaskExperienceSourceView decorates linked memories and usage summaries", () => {
  const task = attachResidentTaskExperienceSourceView({
    id: "task-3",
    conversationId: "conv-3",
    sessionKey: "session-3",
    source: "chat",
    status: "success",
    startedAt: "2026-04-05T00:00:00.000Z",
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    memoryLinks: [{ chunkId: "chunk-private", relation: "used", visibility: "private" }],
    usedMethods: [{
      usageId: "usage-method",
      taskId: "task-3",
      assetType: "method",
      assetKey: "method.md",
      sourceCandidateId: "exp-task-3",
      sourceCandidateTaskId: "task-source",
      usageCount: 2,
      usedVia: "tool",
      createdAt: "2026-04-05T00:02:00.000Z",
    }],
    usedSkills: [],
  } as any, {
    policy: hybridPolicy,
    resolveCandidate: (candidateId) => candidateId === "exp-task-3"
      ? {
        id: "exp-task-3",
        taskId: "task-source",
        type: "method",
        status: "accepted",
        title: "Method Candidate",
        slug: "method-candidate",
        content: "content",
        sourceTaskSnapshot: {
          taskId: "task-source",
          conversationId: "conv-source",
          source: "chat",
          status: "success",
          startedAt: "2026-04-05T00:00:00.000Z",
          memoryLinks: [{ chunkId: "chunk-shared", relation: "used", visibility: "shared" }],
        },
        createdAt: "2026-04-05T00:00:00.000Z",
      }
      : null,
  });

  expect(task.memoryLinks[0]?.sourceView.scope).toBe("private");
  expect(task.usedMethods[0]?.sourceView.scope).toBe("shared");
});
