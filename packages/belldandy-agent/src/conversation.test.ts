import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ConversationStore } from "./conversation.js";

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

    it("should ignore ENOENT append noise when dataDir has been removed", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({ dataDir });
        fs.rmSync(dataDir, { recursive: true, force: true });

        const appendSpy = vi.spyOn(fs, "appendFile").mockImplementation((...args: any[]) => {
            const err = Object.assign(new Error("missing dir"), { code: "ENOENT" });
            const callback = args[args.length - 1] as ((err?: NodeJS.ErrnoException | null) => void) | undefined;
            if (typeof callback === "function") {
                callback(err as NodeJS.ErrnoException);
            }
            return undefined as any;
        });
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        store.addMessage("conv-noise", "user", "hello");
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(appendSpy).toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should still log non-ENOENT append errors", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belldandy-conversation-"));
        const dataDir = path.join(tempDir, "sessions");
        const store = new ConversationStore({ dataDir });

        const appendSpy = vi.spyOn(fs, "appendFile").mockImplementation((...args: any[]) => {
            const err = Object.assign(new Error("denied"), { code: "EACCES" });
            const callback = args[args.length - 1] as ((err?: NodeJS.ErrnoException | null) => void) | undefined;
            if (typeof callback === "function") {
                callback(err as NodeJS.ErrnoException);
            }
            return undefined as any;
        });
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        store.addMessage("conv-error", "user", "hello");
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(appendSpy).toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledTimes(1);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });
});
