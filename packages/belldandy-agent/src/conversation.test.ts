import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ConversationStore, conversationAsyncFs } from "./conversation.js";

describe("ConversationStore", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should add and retrieve messages", () => {
        const store = new ConversationStore();
        const id = "test-conv";

        store.addMessage(id, "user", "Hello");
        store.addMessage(id, "assistant", "Hi there");

        const history = store.getHistory(id);
        expect(history).toHaveLength(2);
        expect(history[0]).toEqual({ role: "user", content: "Hello" });
        expect(history[1]).toEqual({ role: "assistant", content: "Hi there" });
    });

    it("should respect maxHistory limit", () => {
        const store = new ConversationStore({ maxHistory: 2 });
        const id = "test-limit";

        store.addMessage(id, "user", "1");
        store.addMessage(id, "assistant", "2");
        store.addMessage(id, "user", "3");

        const history = store.getHistory(id);
        expect(history).toHaveLength(2);
        expect(history[0]).toEqual({ role: "assistant", content: "2" });
        expect(history[1]).toEqual({ role: "user", content: "3" });
    });

    it("should respect TTL", async () => {
        // TTL 0.01 seconds
        const store = new ConversationStore({ ttlSeconds: 0.01 });
        const id = "test-ttl";

        store.addMessage(id, "user", "Hi");

        // Wait for expiration
        await new Promise(r => setTimeout(r, 20));

        const history = store.getHistory(id);
        expect(history).toHaveLength(0);
    });

    it("should return conversation snapshot together with compacted history", async () => {
        const store = new ConversationStore();
        const id = "test-snapshot";

        store.addMessage(id, "user", "Hello");
        store.addMessage(id, "assistant", "<audio controls>demo</audio>\n\n答复正文\n\n[Download](/generated/demo.mp3)");

        const result = await store.getConversationHistoryCompacted(id);

        expect(result.compacted).toBe(false);
        expect(result.conversation?.id).toBe(id);
        expect(result.conversation?.messages).toHaveLength(2);
        expect(result.history).toEqual([
            { role: "user", content: "Hello" },
            { role: "assistant", content: "答复正文" },
        ]);
    });

    it("should ignore ENOENT append noise when dataDir has been removed", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({ dataDir });
        fs.rmSync(dataDir, { recursive: true, force: true });

        const appendSpy = vi.spyOn(conversationAsyncFs, "appendFile").mockRejectedValue(Object.assign(new Error("missing dir"), { code: "ENOENT" }));
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        store.addMessage("conv-noise", "user", "hello");
        await waitFor(() => appendSpy.mock.calls.length === 1);

        expect(appendSpy).toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should still log non-ENOENT append errors", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({ dataDir });

        const appendSpy = vi.spyOn(conversationAsyncFs, "appendFile").mockRejectedValue(Object.assign(new Error("denied"), { code: "EACCES" }));
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        store.addMessage("conv-error", "user", "hello");
        await waitFor(() => appendSpy.mock.calls.length === 1);
        await waitFor(() => errorSpy.mock.calls.length === 1);

        expect(appendSpy).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledTimes(1);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should serialize append writes for the same conversation", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({ dataDir });
        const appendOrder: string[] = [];
        let releaseFirst!: () => void;
        const firstPending = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let callCount = 0;

        const appendSpy = vi.spyOn(conversationAsyncFs, "appendFile").mockImplementation(async (_path, data) => {
            callCount += 1;
            appendOrder.push(String(data));
            if (callCount === 1) {
                await firstPending;
            }
        });

        store.addMessage("conv-serial", "user", "first");
        store.addMessage("conv-serial", "assistant", "second");

        await waitFor(() => appendSpy.mock.calls.length === 1);
        expect(appendSpy).toHaveBeenCalledTimes(1);

        releaseFirst();
        await waitFor(() => appendSpy.mock.calls.length === 2);

        expect(appendSpy).toHaveBeenCalledTimes(2);
        expect(appendOrder[0]).toContain('"content":"first"');
        expect(appendOrder[1]).toContain('"content":"second"');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should persist task token records and active counters in meta file", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({ dataDir });

        store.addMessage("conv-meta", "user", "hello", { agentId: "agent-a", channel: "webchat" });
        store.recordTaskTokenResult("conv-meta", {
            name: "run",
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
            durationMs: 450,
            auto: true,
            createdAt: 1234567890,
        });
        store.setActiveCounters("conv-meta", [{
            name: "counter-1",
            startTime: 1234,
            baseInputTokens: 10,
            baseOutputTokens: 5,
            savedGlobalInputTokens: 15,
            savedGlobalOutputTokens: 9,
        }]);
        await new Promise((resolve) => setTimeout(resolve, 10));

        const reloaded = new ConversationStore({ dataDir });
        expect(reloaded.get("conv-meta")?.agentId).toBe("agent-a");
        expect(reloaded.get("conv-meta")?.channel).toBe("webchat");
        expect(reloaded.getTaskTokenResults("conv-meta")).toEqual([{
            name: "run",
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
            durationMs: 450,
            auto: true,
            createdAt: 1234567890,
        }]);
        expect(reloaded.getActiveCounters("conv-meta")).toEqual([{
            name: "counter-1",
            startTime: 1234,
            baseInputTokens: 10,
            baseOutputTokens: 5,
            savedGlobalInputTokens: 15,
            savedGlobalOutputTokens: 9,
        }]);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should reload meta-only conversations without jsonl history", () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({ dataDir });

        store.recordTaskTokenResult("conv-meta-only", {
            name: "run",
            inputTokens: 5,
            outputTokens: 7,
            totalTokens: 12,
            durationMs: 321,
            auto: true,
            createdAt: 111,
        });

        const reloaded = new ConversationStore({ dataDir });
        expect(reloaded.getTaskTokenResults("conv-meta-only")).toEqual([{
            name: "run",
            inputTokens: 5,
            outputTokens: 7,
            totalTokens: 12,
            durationMs: 321,
            auto: true,
            createdAt: 111,
        }]);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should persist community conversation files with Windows-safe filenames", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const conversationId = "community:room-1";
        const store = new ConversationStore({ dataDir });

        store.addMessage(conversationId, "user", "hello", {
            agentId: "agent-a",
            channel: "community",
        });
        store.recordTaskTokenResult(conversationId, {
            name: "run",
            inputTokens: 4,
            outputTokens: 6,
            totalTokens: 10,
            durationMs: 120,
            auto: true,
            createdAt: 222,
        });

        await waitFor(() => fs.readdirSync(dataDir).some((entry) => entry.endsWith(".jsonl")));

        const persistedFiles = fs.readdirSync(dataDir);
        expect(persistedFiles.some((entry) => entry.includes(":"))).toBe(false);
        expect(persistedFiles.some((entry) => entry.includes("community%3Aroom-1.meta.json"))).toBe(true);
        expect(persistedFiles.some((entry) => entry.includes("community%3Aroom-1.jsonl"))).toBe(true);

        const reloaded = new ConversationStore({ dataDir });
        expect(reloaded.getHistory(conversationId)).toEqual([{ role: "user", content: "hello" }]);
        expect(reloaded.get(conversationId)?.channel).toBe("community");
        expect(reloaded.get(conversationId)?.agentId).toBe("agent-a");
        expect(reloaded.getTaskTokenResults(conversationId)).toEqual([{
            name: "run",
            inputTokens: 4,
            outputTokens: 6,
            totalTokens: 10,
            durationMs: 120,
            auto: true,
            createdAt: 222,
        }]);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should avoid sync file reads on async cold-load path", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({ dataDir });

        store.addMessage("conv-async-load", "user", "hello", { agentId: "agent-a", channel: "webchat" });
        await new Promise((resolve) => setTimeout(resolve, 10));

        const reloaded = new ConversationStore({ dataDir });
        const readFileSyncSpy = vi.spyOn(fs, "readFileSync");

        const result = await reloaded.getConversationHistoryCompacted("conv-async-load");

        expect(result.conversation?.agentId).toBe("agent-a");
        expect(result.history).toEqual([{ role: "user", content: "hello" }]);
        expect(readFileSyncSpy).not.toHaveBeenCalled();

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should build and persist session digest from compaction state", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({
            dataDir,
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
            summarizer: async () => "rolling-summary-v1",
        });
        const id = "conv-session-digest";

        store.addMessage(id, "user", "A".repeat(80));
        store.addMessage(id, "assistant", "B".repeat(80));
        store.addMessage(id, "user", "C".repeat(80));

        const refreshed = await store.refreshSessionDigest(id, { force: true, threshold: 2 });

        expect(refreshed.updated).toBe(true);
        expect(refreshed.compacted).toBe(true);
        expect(refreshed.digest).toMatchObject({
            conversationId: id,
            status: "ready",
            messageCount: 3,
            digestedMessageCount: 2,
            pendingMessageCount: 1,
            threshold: 2,
            rollingSummary: "rolling-summary-v1",
            archivalSummary: "",
        });
        expect(refreshed.digest.lastDigestAt).toBeGreaterThan(0);

        const reloaded = new ConversationStore({
            dataDir,
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
        });
        const digest = await reloaded.getSessionDigest(id);
        expect(digest.threshold).toBe(2);
        expect(digest.rollingSummary).toBe("rolling-summary-v1");
        expect(digest.digestedMessageCount).toBe(2);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should mark session digest as updated when pending messages cross threshold", async () => {
        const store = new ConversationStore({
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
            summarizer: async () => "rolling-summary-v1",
        });
        const id = "conv-session-digest-threshold";

        store.addMessage(id, "user", "A".repeat(80));
        store.addMessage(id, "assistant", "B".repeat(80));
        store.addMessage(id, "user", "C".repeat(80));
        await store.refreshSessionDigest(id, { force: true, threshold: 2 });

        store.addMessage(id, "assistant", "D".repeat(80));
        store.addMessage(id, "user", "E".repeat(80));

        const digest = await store.getSessionDigest(id, { threshold: 2 });
        expect(digest).toMatchObject({
            conversationId: id,
            status: "updated",
            messageCount: 5,
            digestedMessageCount: 2,
            pendingMessageCount: 3,
            threshold: 2,
        });
    });

    it("should retain persisted digest threshold during automatic refresh", async () => {
        const store = new ConversationStore({
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
            summarizer: async () => "rolling-summary-v1",
        });
        const id = "conv-session-digest-auto-threshold";

        store.addMessage(id, "user", "A".repeat(80));
        store.addMessage(id, "assistant", "B".repeat(80));
        store.addMessage(id, "user", "C".repeat(80));
        await store.refreshSessionDigest(id, { force: true, threshold: 2 });

        store.addMessage(id, "assistant", "D".repeat(80));
        store.addMessage(id, "user", "E".repeat(80));

        const refreshed = await store.refreshSessionDigest(id);
        expect(refreshed.updated).toBe(true);
        expect(refreshed.digest.threshold).toBe(2);
    });

    it("should refresh session digest even when manual compaction is below token threshold", async () => {
        const store = new ConversationStore({
            compaction: {
                enabled: true,
                tokenThreshold: 10_000,
                keepRecentCount: 1,
            },
            summarizer: async () => "rolling-summary-for-refresh",
        });
        const id = "conv-session-digest-force-refresh";

        store.addMessage(id, "user", "第一轮简短消息");
        store.addMessage(id, "assistant", "第一轮回复");
        store.addMessage(id, "user", "第二轮简短消息");

        const before = await store.getSessionDigest(id, { threshold: 2 });
        expect(before).toMatchObject({
            conversationId: id,
            status: "updated",
            rollingSummary: "",
            digestedMessageCount: 0,
            pendingMessageCount: 3,
        });

        const refreshed = await store.refreshSessionDigest(id, { force: true, threshold: 2 });
        expect(refreshed.updated).toBe(true);
        expect(refreshed.compacted).toBe(true);
        expect(refreshed.digest).toMatchObject({
            conversationId: id,
            status: "ready",
            rollingSummary: "rolling-summary-for-refresh",
            digestedMessageCount: 2,
            pendingMessageCount: 1,
            threshold: 2,
        });
    });

    it("should persist compaction state before forceCompact resolves", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({
            dataDir,
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
            summarizer: async () => "rolling-summary-v1",
        });
        const id = "conv-compaction-persist";

        store.addMessage(id, "user", "A".repeat(80));
        store.addMessage(id, "assistant", "B".repeat(80));
        store.addMessage(id, "user", "C".repeat(80));

        const result = await store.forceCompact(id);

        expect(result.compacted).toBe(true);

        const reloaded = new ConversationStore({ dataDir });
        const restoredState = await (reloaded as any).getCompactionStateAsync(id);
        expect(restoredState.rollingSummary).toBe("rolling-summary-v1");
        expect(restoredState.compactedMessageCount).toBe(2);
        expect(restoredState.lastCompactedAt).toBeGreaterThan(0);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should avoid sync file reads when cold-loading compaction state", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const id = "conv-compaction-async";

        const store = new ConversationStore({
            dataDir,
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
            summarizer: async () => "rolling-summary-v1",
        });

        store.addMessage(id, "user", "A".repeat(80));
        store.addMessage(id, "assistant", "B".repeat(80));
        store.addMessage(id, "user", "C".repeat(80));
        await store.forceCompact(id);

        const reloaded = new ConversationStore({
            dataDir,
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
            summarizer: async () => "rolling-summary-v2",
        });
        const readFileSyncSpy = vi.spyOn(fs, "readFileSync");
        const asyncReadSpy = vi.spyOn(conversationAsyncFs, "readFile");

        const result = await reloaded.forceCompact(id);

        expect(result.compacted).toBe(true);
        expect(asyncReadSpy.mock.calls.some(([filePath]) => String(filePath).endsWith(`${id}.compaction.json`))).toBe(true);
        expect(readFileSyncSpy).not.toHaveBeenCalled();

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should avoid sync file reads when cold-loading session digest state", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const id = "conv-session-digest-async";

        const store = new ConversationStore({
            dataDir,
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
            summarizer: async () => "rolling-summary-v1",
        });

        store.addMessage(id, "user", "A".repeat(80));
        store.addMessage(id, "assistant", "B".repeat(80));
        store.addMessage(id, "user", "C".repeat(80));
        await store.refreshSessionDigest(id, { force: true, threshold: 3 });

        const reloaded = new ConversationStore({
            dataDir,
            compaction: {
                enabled: true,
                tokenThreshold: 10,
                keepRecentCount: 1,
            },
        });
        const readFileSyncSpy = vi.spyOn(fs, "readFileSync");
        const asyncReadSpy = vi.spyOn(conversationAsyncFs, "readFile");

        const digest = await reloaded.getSessionDigest(id);

        expect(digest.threshold).toBe(3);
        expect(asyncReadSpy.mock.calls.some(([filePath]) => String(filePath).endsWith(`${id}.digest.json`))).toBe(true);
        expect(asyncReadSpy.mock.calls.some(([filePath]) => String(filePath).endsWith(`${id}.compaction.json`))).toBe(true);
        expect(readFileSyncSpy).not.toHaveBeenCalled();

        fs.rmSync(tempDir, { recursive: true, force: true });
    });
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("timeout");
}
