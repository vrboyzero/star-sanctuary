import { describe, expect, it } from "vitest";

import { PromptSnapshotStore } from "./prompt-snapshot-store.js";

describe("PromptSnapshotStore", () => {
  it("returns the latest snapshot for a conversation", () => {
    const store = new PromptSnapshotStore({ maxSnapshots: 4 });

    store.save({
      agentId: "default",
      conversationId: "conv-1",
      runId: "run-1",
      createdAt: 100,
      systemPrompt: "prompt-1",
      messages: [{ role: "system", content: "prompt-1" }],
    });
    store.save({
      agentId: "default",
      conversationId: "conv-1",
      runId: "run-2",
      createdAt: 200,
      systemPrompt: "prompt-2",
      messages: [{ role: "system", content: "prompt-2" }],
    });

    expect(store.get({ conversationId: "conv-1" })).toMatchObject({
      conversationId: "conv-1",
      runId: "run-2",
      systemPrompt: "prompt-2",
    });
  });

  it("returns a specific snapshot by runId", () => {
    const store = new PromptSnapshotStore({ maxSnapshots: 4 });

    store.save({
      agentId: "default",
      conversationId: "conv-1",
      runId: "run-1",
      createdAt: 100,
      systemPrompt: "prompt-1",
      messages: [{ role: "system", content: "prompt-1" }],
    });
    store.save({
      agentId: "default",
      conversationId: "conv-2",
      runId: "run-2",
      createdAt: 200,
      systemPrompt: "prompt-2",
      messages: [{ role: "system", content: "prompt-2" }],
    });

    expect(store.get({ runId: "run-1" })).toMatchObject({
      conversationId: "conv-1",
      runId: "run-1",
      systemPrompt: "prompt-1",
    });
    expect(store.get({ conversationId: "conv-2", runId: "run-1" })).toBeUndefined();
  });

  it("evicts the oldest snapshots when exceeding the configured limit", () => {
    const store = new PromptSnapshotStore({ maxSnapshots: 2 });

    store.save({
      agentId: "default",
      conversationId: "conv-1",
      runId: "run-1",
      createdAt: 100,
      systemPrompt: "prompt-1",
      messages: [{ role: "system", content: "prompt-1" }],
    });
    store.save({
      agentId: "default",
      conversationId: "conv-2",
      runId: "run-2",
      createdAt: 200,
      systemPrompt: "prompt-2",
      messages: [{ role: "system", content: "prompt-2" }],
    });
    store.save({
      agentId: "default",
      conversationId: "conv-3",
      runId: "run-3",
      createdAt: 300,
      systemPrompt: "prompt-3",
      messages: [{ role: "system", content: "prompt-3" }],
    });

    expect(store.get({ runId: "run-1" })).toBeUndefined();
    expect(store.get({ runId: "run-2" })).toMatchObject({ conversationId: "conv-2" });
    expect(store.get({ runId: "run-3" })).toMatchObject({ conversationId: "conv-3" });
  });
});
