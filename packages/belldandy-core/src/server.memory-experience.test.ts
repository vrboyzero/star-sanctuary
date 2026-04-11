import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, expect, test } from "vitest";
import WebSocket from "ws";

import { AgentRegistry, ConversationStore, MockAgent } from "@belldandy/agent";
import { MemoryManager, registerGlobalMemoryManager } from "@belldandy/memory";
import { SkillRegistry } from "@belldandy/skills";

import { createScopedMemoryManagers } from "./resident-memory-managers.js";
import { startGatewayServer } from "./server.js";
import {
  cleanupGlobalMemoryManagersForTest,
  pairWebSocketClient,
  resolveWebRoot,
  waitFor,
} from "./server-testkit.js";

// MemoryManager 内部会初始化 OpenAIEmbeddingProvider，需要 OPENAI_API_KEY
// 测试环境中设置一个占位值，避免构造函数抛错（不会实际调用 API）
beforeAll(() => {
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = "test-placeholder-key";
  }
});

afterEach(() => {
  cleanupGlobalMemoryManagersForTest();
});

test("memory.share.queue supports centralized claim and review across resident agents", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-shared-review-queue-"));
  const registry = new AgentRegistry(() => new MockAgent());
  registry.register({
    id: "default",
    displayName: "Belldandy",
    model: "primary",
    memoryMode: "hybrid",
  });
  registry.register({
    id: "coder",
    displayName: "Coder",
    model: "primary",
    workspaceDir: "coder",
    sessionNamespace: "coder-main",
    memoryMode: "isolated",
  });

  const residentMemoryManagers = createScopedMemoryManagers({
    stateDir,
    agentRegistry: registry,
    modelsDir: path.join(stateDir, "models"),
    conversationStore: new ConversationStore({
      dataDir: path.join(stateDir, "sessions"),
    }),
    indexerOptions: {
      watch: false,
    },
  }).records;
  const defaultRecord = residentMemoryManagers.find((record) => record.agentId === "default");
  expect(defaultRecord).toBeTruthy();
  if (!defaultRecord) {
    throw new Error("default resident memory manager is required");
  }
  defaultRecord.manager.upsertMemoryChunk({
    id: "shared-review-chunk",
    sourcePath: "memory/shared-review.md",
    sourceType: "manual",
    memoryType: "other",
    content: "shared review queue smoke",
    visibility: "private",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
    residentMemoryManagers,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    frames.length = 0;

    ws.send(JSON.stringify({
      type: "req",
      id: "share-promote",
      method: "memory.share.promote",
      params: {
        agentId: "default",
        chunkId: "shared-review-chunk",
        reason: "queue smoke",
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-promote"));

    const promoteRes = frames.find((frame) => frame.type === "res" && frame.id === "share-promote");
    expect(promoteRes.ok).toBe(true);

    ws.send(JSON.stringify({
      type: "req",
      id: "share-queue-pending",
      method: "memory.share.queue",
      params: {
        reviewerAgentId: "coder",
        filter: { sharedPromotionStatus: "pending" },
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-queue-pending"));

    const queueRes = frames.find((frame) => frame.type === "res" && frame.id === "share-queue-pending");
    expect(queueRes.ok).toBe(true);
    expect(queueRes.payload?.summary).toMatchObject({
      pendingCount: 1,
      reviewerAgentId: "coder",
      reviewerActionableCount: 1,
    });
    expect(queueRes.payload?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "shared-review-chunk",
        targetAgentId: "default",
        reviewStatus: "pending",
        actionableByReviewer: true,
      }),
    ]));

    ws.send(JSON.stringify({
      type: "req",
      id: "share-claim",
      method: "memory.share.claim",
      params: {
        reviewerAgentId: "coder",
        targetAgentId: "default",
        chunkId: "shared-review-chunk",
        action: "claim",
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-claim"));
    const claimRes = frames.find((frame) => frame.type === "res" && frame.id === "share-claim");
    expect(claimRes.ok).toBe(true);
    expect(claimRes.payload).toMatchObject({
      reviewerAgentId: "coder",
      targetAgentId: "default",
      claimedCount: 1,
    });

    ws.send(JSON.stringify({
      type: "req",
      id: "share-queue-claimed",
      method: "memory.share.queue",
      params: {
        reviewerAgentId: "coder",
        filter: { sharedPromotionStatus: "pending" },
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-queue-claimed"));
    const claimedQueueRes = frames.find((frame) => frame.type === "res" && frame.id === "share-queue-claimed");
    expect(claimedQueueRes.ok).toBe(true);
    expect(claimedQueueRes.payload?.summary).toMatchObject({
      pendingCount: 1,
      claimedCount: 1,
      reviewerClaimedCount: 1,
    });

    ws.send(JSON.stringify({
      type: "req",
      id: "share-approve",
      method: "memory.share.review",
      params: {
        reviewerAgentId: "coder",
        targetAgentId: "default",
        chunkId: "shared-review-chunk",
        decision: "approved",
        note: "queue approved",
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-approve"));
    const approveRes = frames.find((frame) => frame.type === "res" && frame.id === "share-approve");
    expect(approveRes.ok).toBe(true);
    expect(approveRes.payload).toMatchObject({
      reviewerAgentId: "coder",
      targetAgentId: "default",
      reviewedCount: 1,
      decision: "approved",
    });

    ws.send(JSON.stringify({
      type: "req",
      id: "share-queue-approved",
      method: "memory.share.queue",
      params: {
        reviewerAgentId: "coder",
        filter: { sharedPromotionStatus: "approved" },
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-queue-approved"));
    const approvedQueueRes = frames.find((frame) => frame.type === "res" && frame.id === "share-queue-approved");
    expect(approvedQueueRes.ok).toBe(true);
    expect(approvedQueueRes.payload?.summary).toMatchObject({
      approvedCount: 1,
    });
    expect(approvedQueueRes.payload?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "shared-review-chunk",
        targetAgentId: "default",
        reviewStatus: "approved",
      }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("memory.share.queue treats timed-out claims as overdue and actionable again", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-shared-review-timeout-"));
  const registry = new AgentRegistry(() => new MockAgent());
  registry.register({
    id: "default",
    displayName: "Belldandy",
    model: "primary",
    memoryMode: "hybrid",
  });
  registry.register({
    id: "coder",
    displayName: "Coder",
    model: "primary",
    workspaceDir: "coder",
    sessionNamespace: "coder-main",
    memoryMode: "isolated",
  });
  registry.register({
    id: "reviewer",
    displayName: "Reviewer",
    model: "primary",
    workspaceDir: "reviewer",
    sessionNamespace: "reviewer-main",
    memoryMode: "isolated",
  });

  const residentMemoryManagers = createScopedMemoryManagers({
    stateDir,
    agentRegistry: registry,
    modelsDir: path.join(stateDir, "models"),
    conversationStore: new ConversationStore({
      dataDir: path.join(stateDir, "sessions"),
    }),
    indexerOptions: {
      watch: false,
    },
  }).records;
  const defaultRecord = residentMemoryManagers.find((record) => record.agentId === "default");
  expect(defaultRecord).toBeTruthy();
  if (!defaultRecord) {
    throw new Error("default resident memory manager is required");
  }

  defaultRecord.manager.upsertMemoryChunk({
    id: "shared-review-timeout-chunk",
    sourcePath: "memory/shared-review-timeout.md",
    sourceType: "manual",
    memoryType: "other",
    content: "shared review timeout smoke",
    visibility: "private",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
    residentMemoryManagers,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    frames.length = 0;

    ws.send(JSON.stringify({
      type: "req",
      id: "share-timeout-promote",
      method: "memory.share.promote",
      params: {
        agentId: "default",
        chunkId: "shared-review-timeout-chunk",
        reason: "timeout smoke",
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-timeout-promote"));

    ws.send(JSON.stringify({
      type: "req",
      id: "share-timeout-claim",
      method: "memory.share.claim",
      params: {
        reviewerAgentId: "coder",
        targetAgentId: "default",
        chunkId: "shared-review-timeout-chunk",
        action: "claim",
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-timeout-claim"));
    const claimRes = frames.find((frame) => frame.type === "res" && frame.id === "share-timeout-claim");
    expect(claimRes?.ok).toBe(true);

    const claimedItem = defaultRecord.manager.getMemory("shared-review-timeout-chunk");
    expect(claimedItem?.metadata?.sharedPromotion?.claimedByAgentId).toBe("coder");
    expect(claimedItem?.metadata?.sharedPromotion?.claimedAt).toEqual(expect.any(String));
    const claimedSourceType = claimedItem?.sourceType;
    defaultRecord.manager.upsertMemoryChunk({
      id: claimedItem?.id ?? "shared-review-timeout-chunk",
      sourcePath: claimedItem?.sourcePath ?? "memory/shared-review-timeout.md",
      sourceType: claimedSourceType === "session" || claimedSourceType === "manual" ? claimedSourceType : "manual",
      memoryType: claimedItem?.memoryType ?? "other",
      content: claimedItem?.content ?? claimedItem?.snippet ?? "shared review timeout smoke",
      startLine: claimedItem?.startLine,
      endLine: claimedItem?.endLine,
      category: claimedItem?.category,
      visibility: claimedItem?.visibility ?? "private",
      metadata: {
        ...(claimedItem?.metadata ?? {}),
        sharedPromotion: {
          ...(claimedItem?.metadata?.sharedPromotion ?? {}),
          claimedAt: new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString(),
        },
      },
    });

    ws.send(JSON.stringify({
      type: "req",
      id: "share-timeout-queue",
      method: "memory.share.queue",
      params: {
        reviewerAgentId: "reviewer",
        filter: { sharedPromotionStatus: "pending" },
      },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "share-timeout-queue"));
    const queueRes = frames.find((frame) => frame.type === "res" && frame.id === "share-timeout-queue");
    expect(queueRes?.ok).toBe(true);
    expect(queueRes?.payload?.summary).toMatchObject({
      pendingCount: 1,
      claimedCount: 0,
      overdueCount: 1,
      blockedCount: 0,
      reviewerActionableCount: 1,
    });
    expect(queueRes?.payload?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "shared-review-timeout-chunk",
        claimOwner: "coder",
        claimTimedOut: true,
        actionableByReviewer: true,
        blockedByOtherReviewer: false,
      }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("memory viewer rpc returns task and memory data", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-workspace-"));
  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    taskMemoryEnabled: true,
  });
  (memoryManager as any).embeddingProvider = {
    modelName: "test-memory-viewer",
    embed: async () => [0.1],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
    embedQuery: async () => [0.1],
  };

  await fs.promises.writeFile(path.join(workspaceRoot, "MEMORY.md"), "# Belldandy\nMemory viewer test content.\n", "utf-8");
  await memoryManager.indexWorkspace();
  (memoryManager as any).store.upsertChunk({
    id: "chunk-category-decision",
    sourcePath: "memory/category-decision.md",
    sourceType: "manual",
    memoryType: "other",
    content: "phase4decision marker: complete category minimum loop first.",
    category: "decision",
  });
  (memoryManager as any).store.upsertChunk({
    id: "chunk-topic-viewer",
    sourcePath: "memory/topic-viewer.md",
    sourceType: "manual",
    memoryType: "other",
    content: "viewer topic marker: topic filtered memory for rpc viewer.",
    topic: "viewer-audit",
    visibility: "shared",
  });
  registerGlobalMemoryManager(memoryManager);

  const recentChunk = memoryManager.getRecent(5).find((item) => item.sourcePath.endsWith("MEMORY.md")) ?? memoryManager.getRecent(1)[0];
  expect(recentChunk?.id).toBeTruthy();

  const startedTaskId = memoryManager.startTaskCapture({
    conversationId: "conv-memory-viewer",
    sessionKey: "session-memory-viewer",
    source: "chat",
    objective: "Implement memory viewer",
    metadata: {
      goalId: "goal_memory_viewer",
      goalSession: true,
    },
  });
  expect(startedTaskId).toBeTruthy();
  if (recentChunk?.id) {
    memoryManager.linkTaskMemories("conv-memory-viewer", [recentChunk.id, "chunk-topic-viewer"], "used");
  }
  memoryManager.recordTaskToolCall("conv-memory-viewer", {
    toolName: "memory_search",
    success: true,
    durationMs: 120,
  });
  const completedTaskId = memoryManager.completeTaskCapture({
    conversationId: "conv-memory-viewer",
    success: true,
    durationMs: 1200,
    messages: [{ type: "usage", inputTokens: 12, outputTokens: 8 }],
  });
  expect(completedTaskId).toBeTruthy();
  const methodCandidate = memoryManager.promoteTaskToMethodCandidate(completedTaskId!);
  expect(methodCandidate?.candidate.id).toBeTruthy();
  const acceptedMethodCandidate = memoryManager.acceptExperienceCandidate(methodCandidate!.candidate.id);
  expect(acceptedMethodCandidate?.publishedPath).toBeTruthy();
  (memoryManager as any).store.createTask({
    id: "task-non-goal-viewer",
    conversationId: "conv-memory-viewer-other",
    sessionKey: "session-memory-viewer-other",
    source: "manual",
    status: "success",
    title: "Unrelated maintenance task",
    objective: "should not appear in goal-filtered task list",
    startedAt: "2026-03-16T00:05:00.000Z",
    finishedAt: "2026-03-16T00:05:10.000Z",
    createdAt: "2026-03-16T00:05:00.000Z",
    updatedAt: "2026-03-16T00:05:10.000Z",
  });
  (memoryManager as any).store.createExperienceUsage({
    id: "usage-viewer-method",
    taskId: completedTaskId!,
    assetType: "method",
    assetKey: path.basename(acceptedMethodCandidate!.publishedPath!),
    sourceCandidateId: methodCandidate!.candidate.id,
    usedVia: "tool",
    createdAt: "2026-03-16T00:00:01.000Z",
  });
  (memoryManager as any).store.createExperienceUsage({
    id: "usage-viewer-skill",
    taskId: completedTaskId!,
    assetType: "skill",
    assetKey: "Viewer Skill",
    usedVia: "search",
    createdAt: "2026-03-16T00:00:02.000Z",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    additionalWorkspaceRoots: [workspaceRoot],
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({ type: "req", id: "memory-stats", method: "memory.stats" }));
    ws.send(JSON.stringify({ type: "req", id: "memory-stats-with-recent", method: "memory.stats", params: { includeRecentTasks: true } }));
    ws.send(JSON.stringify({ type: "req", id: "task-list", method: "memory.task.list", params: { limit: 5, summaryOnly: true } }));
    ws.send(JSON.stringify({ type: "req", id: "task-list-goal", method: "memory.task.list", params: { limit: 5, summaryOnly: true, filter: { goalId: "goal_memory_viewer" } } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent", method: "memory.recent", params: { limit: 5, includeContent: false } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent-uncategorized", method: "memory.recent", params: { limit: 5, includeContent: false, filter: { uncategorized: true } } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-search", method: "memory.search", params: { query: "viewer", limit: 5, includeContent: false } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-search-topic", method: "memory.search", params: { query: "viewer topic", limit: 5, includeContent: false, filter: { topic: "viewer-audit" } } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent-category", method: "memory.recent", params: { limit: 5, includeContent: false, filter: { category: "decision" } } }));
    ws.send(JSON.stringify({ type: "req", id: "usage-list", method: "experience.usage.list", params: { limit: 10, filter: { taskId: completedTaskId } } }));
    ws.send(JSON.stringify({ type: "req", id: "usage-stats", method: "experience.usage.stats", params: { limit: 10, filter: { assetType: "method" } } }));
    ws.send(JSON.stringify({ type: "req", id: "usage-get", method: "experience.usage.get", params: { usageId: "usage-viewer-method" } }));
    ws.send(JSON.stringify({ type: "req", id: "candidate-get", method: "experience.candidate.get", params: { candidateId: methodCandidate!.candidate.id } }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-stats"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-stats-with-recent"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "task-list"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "task-list-goal"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent-uncategorized"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-search"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-search-topic"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent-category"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-list"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-stats"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-get"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-get"));

    const taskListRes = frames.find((f) => f.type === "res" && f.id === "task-list");
    const taskListGoalRes = frames.find((f) => f.type === "res" && f.id === "task-list-goal");
    const memoryRecentRes = frames.find((f) => f.type === "res" && f.id === "memory-recent");
    const memoryRecentUncategorizedRes = frames.find((f) => f.type === "res" && f.id === "memory-recent-uncategorized");
    const memorySearchRes = frames.find((f) => f.type === "res" && f.id === "memory-search");
    const memorySearchTopicRes = frames.find((f) => f.type === "res" && f.id === "memory-search-topic");
    const memoryRecentCategoryRes = frames.find((f) => f.type === "res" && f.id === "memory-recent-category");
    const statsRes = frames.find((f) => f.type === "res" && f.id === "memory-stats");
    const statsWithRecentRes = frames.find((f) => f.type === "res" && f.id === "memory-stats-with-recent");
    const usageListRes = frames.find((f) => f.type === "res" && f.id === "usage-list");
    const usageStatsRes = frames.find((f) => f.type === "res" && f.id === "usage-stats");
    const usageGetRes = frames.find((f) => f.type === "res" && f.id === "usage-get");
    const candidateGetRes = frames.find((f) => f.type === "res" && f.id === "candidate-get");

    expect(statsRes.ok).toBe(true);
    expect(statsRes.payload.status.chunks).toBeGreaterThan(0);
    expect(statsRes.payload.status.categorized).toBeGreaterThan(0);
    expect(statsRes.payload.status.uncategorized).toBeGreaterThan(0);
    expect(statsRes.payload.status.categoryBuckets.decision).toBeGreaterThan(0);
    expect(statsRes.payload.recentTasks).toBeUndefined();
    expect(statsRes.payload.queryView.scope).toBe("private");
    expect(statsWithRecentRes.ok).toBe(true);
    expect(Array.isArray(statsWithRecentRes.payload.recentTasks)).toBe(true);
    expect(statsWithRecentRes.payload.recentTasks.length).toBeGreaterThan(0);
    expect(taskListRes.ok).toBe(true);
    expect(taskListRes.payload.items.length).toBeGreaterThan(0);
    expect(taskListRes.payload.items[0].toolCalls).toBeUndefined();
    expect(taskListRes.payload.items[0].artifactPaths).toBeUndefined();
    expect(taskListGoalRes.ok).toBe(true);
    expect(taskListGoalRes.payload.items.length).toBeGreaterThan(0);
    expect(taskListGoalRes.payload.items.every((item: any) => item?.metadata?.goalId === "goal_memory_viewer")).toBe(true);
    expect(taskListGoalRes.payload.items.some((item: any) => item?.id === "task-non-goal-viewer")).toBe(false);
    expect(memoryRecentRes.ok).toBe(true);
    expect(memoryRecentRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentRes.payload.items[0].content).toBeUndefined();
    expect(memoryRecentRes.payload.items[0].sourceView.scope).toBeTruthy();
    expect(memoryRecentUncategorizedRes.ok).toBe(true);
    expect(memoryRecentUncategorizedRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentUncategorizedRes.payload.items[0].category).toBeUndefined();
    expect(memoryRecentUncategorizedRes.payload.items[0].content).toBeUndefined();
    expect(memorySearchRes.ok).toBe(true);
    expect(Array.isArray(memorySearchRes.payload.items)).toBe(true);
    expect(memorySearchRes.payload.items.every((item: any) => item.content === undefined)).toBe(true);
    expect(memorySearchTopicRes.ok).toBe(true);
    expect(memorySearchTopicRes.payload.items.length).toBeGreaterThan(0);
    expect(memorySearchTopicRes.payload.items.every((item: any) => item.sourcePath === "memory/topic-viewer.md")).toBe(true);
    expect(memorySearchTopicRes.payload.items[0].content).toBeUndefined();
    expect(memorySearchTopicRes.payload.items[0].sourceView.scope).toBe("shared");
    expect(memoryRecentCategoryRes.ok).toBe(true);
    expect(memoryRecentCategoryRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentCategoryRes.payload.items[0].category).toBe("decision");
    expect(memoryRecentCategoryRes.payload.items[0].content).toBeUndefined();
    expect(memoryRecentCategoryRes.payload.items[0].sourceView.scope).toBe("private");
    expect(usageListRes.ok).toBe(true);
    expect(usageListRes.payload.items.length).toBe(2);
    const methodUsageItem = usageListRes.payload.items.find((item: any) => item.sourceCandidateId === methodCandidate!.candidate.id);
    expect(methodUsageItem?.sourceView.scope).toBe("hybrid");
    expect(usageStatsRes.ok).toBe(true);
    expect(usageStatsRes.payload.items[0].assetKey).toBe(path.basename(acceptedMethodCandidate!.publishedPath!));
    expect(usageStatsRes.payload.items[0].usageCount).toBeGreaterThan(0);
    expect(usageStatsRes.payload.items[0].sourceCandidateId).toBe(methodCandidate!.candidate.id);
    expect(usageStatsRes.payload.items[0].sourceCandidatePublishedPath).toBe(acceptedMethodCandidate!.publishedPath);
    expect(usageStatsRes.payload.items[0].sourceView.scope).toBe("hybrid");
    expect(usageGetRes.ok).toBe(true);
    expect(usageGetRes.payload.usage.id).toBe("usage-viewer-method");
    expect(usageGetRes.payload.usage.sourceCandidateId).toBe(methodCandidate!.candidate.id);
    expect(usageGetRes.payload.usage.sourceView.scope).toBe("hybrid");
    expect(candidateGetRes.ok).toBe(true);
    expect(candidateGetRes.payload.candidate.id).toBe(methodCandidate!.candidate.id);
    expect(candidateGetRes.payload.candidate.publishedPath).toBe(acceptedMethodCandidate!.publishedPath);
    expect(candidateGetRes.payload.candidate.sourceView.scope).toBe("hybrid");
    expect(candidateGetRes.payload.candidate.sourceTaskSnapshot.memoryLinks.some((item: any) => item.sourceView.scope === "shared")).toBe(true);
    expect(candidateGetRes.payload.candidate.learningReviewInput.summary.available).toBe(true);
    expect(candidateGetRes.payload.candidate.learningReviewInput.summaryLines.some((item: string) => item.includes("method candidate"))).toBe(true);

    const usageIdToRevoke = usageListRes.payload.items[0].id;
    ws.send(JSON.stringify({ type: "req", id: "usage-revoke", method: "experience.usage.revoke", params: { usageId: usageIdToRevoke } }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-revoke"));
    const usageRevokeRes = frames.find((f) => f.type === "res" && f.id === "usage-revoke");
    ws.send(JSON.stringify({ type: "req", id: "usage-list-after-revoke", method: "experience.usage.list", params: { limit: 10, filter: { taskId: completedTaskId } } }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-list-after-revoke"));
    const usageListAfterRevokeRes = frames.find((f) => f.type === "res" && f.id === "usage-list-after-revoke");
    expect(usageRevokeRes.ok).toBe(true);
    expect(usageRevokeRes.payload.revoked).toBe(true);
    expect(usageRevokeRes.payload.usage.id).toBe(usageIdToRevoke);
    expect(usageListAfterRevokeRes.ok).toBe(true);
    expect(usageListAfterRevokeRes.payload.items.length).toBe(1);
    const revokedAssetType = usageRevokeRes.payload.usage.assetType;

    const taskId = taskListRes.payload.items[0].id;
    const chunkId = memoryRecentCategoryRes.payload.items[0].id;

    ws.send(JSON.stringify({ type: "req", id: "task-get", method: "memory.task.get", params: { taskId } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-get", method: "memory.get", params: { chunkId } }));
    ws.send(JSON.stringify({ type: "req", id: "source-read", method: "workspace.readSource", params: { path: recentChunk.sourcePath } }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "task-get"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-get"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "source-read"));

    const taskGetRes = frames.find((f) => f.type === "res" && f.id === "task-get");
    const memoryGetRes = frames.find((f) => f.type === "res" && f.id === "memory-get");
    const sourceReadRes = frames.find((f) => f.type === "res" && f.id === "source-read");

    expect(taskGetRes.ok).toBe(true);
    expect(taskGetRes.payload.task.memoryLinks.length).toBeGreaterThan(0);
    expect(taskGetRes.payload.task.memoryLinks.some((item: any) => item.sourceView.scope === "shared")).toBe(true);
    expect(taskGetRes.payload.task.usedMethods.length + taskGetRes.payload.task.usedSkills.length).toBe(1);
    if (revokedAssetType === "method") {
      expect(taskGetRes.payload.task.usedMethods.length).toBe(0);
      expect(taskGetRes.payload.task.usedSkills.length).toBe(1);
      expect(taskGetRes.payload.task.usedSkills[0].assetKey).toBe("Viewer Skill");
    } else {
      expect(taskGetRes.payload.task.usedMethods.length).toBe(1);
      expect(taskGetRes.payload.task.usedMethods[0].assetKey).toBe(path.basename(acceptedMethodCandidate!.publishedPath!));
      expect(taskGetRes.payload.task.usedMethods[0].sourceCandidateId).toBe(methodCandidate!.candidate.id);
      expect(taskGetRes.payload.task.usedMethods[0].sourceCandidatePublishedPath).toBe(acceptedMethodCandidate!.publishedPath);
      expect(taskGetRes.payload.task.usedSkills.length).toBe(0);
    }
    expect(memoryGetRes.ok).toBe(true);
    expect(memoryGetRes.payload.item.category).toBe("decision");
    expect(memoryGetRes.payload.item.content).toContain("phase4decision");
    expect(memoryGetRes.payload.item.sourceView.scope).toBe("private");
    expect(sourceReadRes.ok).toBe(true);
    expect(sourceReadRes.payload.readOnly).toBe(true);
    expect(sourceReadRes.payload.content).toContain("Memory viewer test content");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    memoryManager.close();
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("experience candidate rpc lists and updates candidate status", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-experience-workspace-"));
  const skillRegistry = new SkillRegistry();
  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    taskMemoryEnabled: true,
  });

  const now = "2026-03-15T00:00:00.000Z";
  (memoryManager as any).store.createTask({
    id: "task-experience-1",
    conversationId: "conv-experience-1",
    sessionKey: "session-experience-1",
    source: "chat",
    status: "success",
    title: "收敛第五阶段方案",
    objective: "为第五阶段生成候选层闭环",
    summary: "已经梳理出候选层数据结构与接口边界。",
    reflection: "先做候选层，再做发布链路，能避免污染正式资产。",
    toolCalls: [{ toolName: "memory_search", success: true, durationMs: 90 }],
    artifactPaths: ["MemOS对比分析.md"],
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const methodCandidate = memoryManager.promoteTaskToMethodCandidate("task-experience-1");
  const skillCandidate = memoryManager.promoteTaskToSkillCandidate("task-experience-1");
  expect(methodCandidate?.candidate.id).toBeTruthy();
  expect(skillCandidate?.candidate.id).toBeTruthy();

  registerGlobalMemoryManager(memoryManager);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    additionalWorkspaceRoots: [workspaceRoot],
    skillRegistry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "candidate-list",
      method: "experience.candidate.list",
      params: { limit: 10, filter: { status: "draft" } },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-list"));

    const listRes = frames.find((f) => f.type === "res" && f.id === "candidate-list");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload.items.length).toBe(2);

    ws.send(JSON.stringify({
      type: "req",
      id: "candidate-accept",
      method: "experience.candidate.accept",
      params: { candidateId: methodCandidate!.candidate.id },
    }));
    ws.send(JSON.stringify({
      type: "req",
      id: "candidate-skill-accept",
      method: "experience.candidate.accept",
      params: { candidateId: skillCandidate!.candidate.id },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-accept"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-skill-accept"));

    const acceptRes = frames.find((f) => f.type === "res" && f.id === "candidate-accept");
    const skillAcceptRes = frames.find((f) => f.type === "res" && f.id === "candidate-skill-accept");
    expect(acceptRes.ok).toBe(true);
    expect(acceptRes.payload.candidate.status).toBe("accepted");
    const acceptedCandidate = memoryManager.getExperienceCandidate(methodCandidate!.candidate.id);
    expect(acceptedCandidate?.publishedPath).toContain(path.join(stateDir, "methods"));
    const publishedContent = await fs.promises.readFile(acceptedCandidate!.publishedPath!, "utf-8");
    expect(publishedContent).toContain("# 收敛第五阶段方案 方法候选");

    expect(skillAcceptRes.ok).toBe(true);
    expect(skillAcceptRes.payload.candidate.status).toBe("accepted");
    const acceptedSkillCandidate = memoryManager.getExperienceCandidate(skillCandidate!.candidate.id);
    expect(acceptedSkillCandidate?.publishedPath).toContain(path.join(stateDir, "skills"));
    const publishedSkillContent = await fs.promises.readFile(acceptedSkillCandidate!.publishedPath!, "utf-8");
    expect(publishedSkillContent).toContain("name:");
    expect(skillRegistry.getSkill("收敛第五阶段方案 技能草稿")).toBeTruthy();

    ws.send(JSON.stringify({
      type: "req",
      id: "candidate-accept-again",
      method: "experience.candidate.accept",
      params: { candidateId: methodCandidate!.candidate.id },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-accept-again"));

    const invalidAcceptRes = frames.find((f) => f.type === "res" && f.id === "candidate-accept-again");
    expect(invalidAcceptRes.ok).toBe(false);
    expect(invalidAcceptRes.error.code).toBe("invalid_state");
    expect(invalidAcceptRes.error.message).toContain("Current status: accepted");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    memoryManager.close();
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
