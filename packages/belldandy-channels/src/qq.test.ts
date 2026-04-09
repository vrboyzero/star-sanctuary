import { afterEach, describe, expect, it, vi } from "vitest";

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { ConversationStore } from "@belldandy/agent";

import { QqChannel } from "./qq.js";
import { createFileCurrentConversationBindingStore } from "./current-conversation-binding-store.js";
import { normalizeReplyChunkingConfig } from "./reply-chunking-config.js";
import { buildChannelSessionDescriptor } from "./session-key.js";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("QqChannel", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("keeps reply context isolated for concurrent messages", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
            ok: true,
            text: async () => "",
        }));
        vi.stubGlobal("fetch", fetchMock);

        const agent = {
            run: vi.fn(async function* (input: { text: string }) {
                if (input.text === "first") {
                    await sleep(20);
                }
                yield {
                    type: "final" as const,
                    text: `reply:${input.text}`,
                };
            }),
        };

        const channel = new QqChannel({
            appId: "app-id",
            appSecret: "app-secret",
            sandbox: true,
            agent: agent as any,
            conversationStore: new ConversationStore(),
        });

        (channel as any).accessToken = "qq-token";

        const firstMessage = {
            id: "msg-1",
            content: "first",
            channel_id: "channel-a",
            guild_id: "guild-a",
            author: {
                id: "user-a",
                username: "Alice",
            },
        };
        const secondMessage = {
            id: "msg-2",
            content: "second",
            channel_id: "channel-b",
            guild_id: "guild-b",
            author: {
                id: "user-b",
                username: "Bob",
            },
        };

        await Promise.all([
            (channel as any).handleMessage(firstMessage, "MESSAGE_CREATE"),
            (channel as any).handleMessage(secondMessage, "MESSAGE_CREATE"),
        ]);

        expect(agent.run).toHaveBeenCalledWith(expect.objectContaining({
            conversationId: "qq_channel-a",
            meta: expect.objectContaining({
                channel: "qq",
                sessionScope: "per-channel-peer",
                sessionKey: expect.stringContaining("channel=qq"),
                legacyConversationId: "qq_channel-a",
            }),
        }));
        expect(agent.run).toHaveBeenCalledWith(expect.objectContaining({
            conversationId: "qq_channel-b",
            meta: expect.objectContaining({
                channel: "qq",
                sessionScope: "per-channel-peer",
                sessionKey: expect.stringContaining("chat=channel-b"),
                legacyConversationId: "qq_channel-b",
            }),
        }));
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const sent = fetchMock.mock.calls.map(([url, init]) => ({
            url: String(url),
            body: JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as { content?: string; msg_id?: string },
        }));

        expect(sent).toEqual(expect.arrayContaining([
            expect.objectContaining({
                url: "https://sandbox.api.sgroup.qq.com/channels/channel-a/messages",
                body: expect.objectContaining({
                    content: "reply:first",
                    msg_id: "msg-1",
                }),
            }),
            expect.objectContaining({
                url: "https://sandbox.api.sgroup.qq.com/channels/channel-b/messages",
                body: expect.objectContaining({
                    content: "reply:second",
                    msg_id: "msg-2",
                }),
            }),
        ]));
    });

    it("uses the requested chat context for proactive messages", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
            ok: true,
            text: async () => "",
        }));
        vi.stubGlobal("fetch", fetchMock);

        const channel = new QqChannel({
            appId: "app-id",
            appSecret: "app-secret",
            sandbox: true,
            agent: { async *run() {} } as any,
            conversationStore: new ConversationStore(),
        });

        (channel as any).accessToken = "qq-token";

        await (channel as any).handleMessage({
            id: "msg-1",
            content: "first",
            channel_id: "channel-a",
            guild_id: "guild-a",
            author: {
                id: "user-a",
                username: "Alice",
            },
        }, "MESSAGE_CREATE");

        await (channel as any).handleMessage({
            id: "msg-2",
            content: "second",
            channel_id: "channel-b",
            guild_id: "guild-b",
            author: {
                id: "user-b",
                username: "Bob",
            },
        }, "MESSAGE_CREATE");

        fetchMock.mockClear();

        const sent = await channel.sendProactiveMessage("manual", "channel-a");

        expect(sent).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://sandbox.api.sgroup.qq.com/channels/channel-a/messages");
        expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"))).toEqual(
            expect.objectContaining({
                content: "manual",
                msg_id: "msg-1",
            }),
        );
    });

    it("chunks long proactive markdown replies through the shared outbound chunker", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
            ok: true,
            text: async () => "",
        }));
        vi.stubGlobal("fetch", fetchMock);

        const channel = new QqChannel({
            appId: "app-id",
            appSecret: "app-secret",
            sandbox: true,
            agent: { async *run() {} } as any,
            conversationStore: new ConversationStore(),
            replyChunkingConfig: normalizeReplyChunkingConfig({
                channels: {
                    qq: {
                        textLimit: 120,
                        chunkMode: "length",
                    },
                },
            }),
        });

        (channel as any).accessToken = "qq-token";

        await (channel as any).handleMessage({
            id: "msg-1",
            content: "seed",
            channel_id: "channel-a",
            guild_id: "guild-a",
            author: {
                id: "user-a",
                username: "Alice",
            },
        }, "MESSAGE_CREATE");

        fetchMock.mockClear();

        const longCode = Array.from({ length: 180 }, (_, index) => `console.log("line-${index}-xxxxxxxx");`).join("\n");
        const sent = await channel.sendProactiveMessage(`Intro\n\n\`\`\`ts\n${longCode}\n\`\`\`\n\nTail`, "channel-a");

        expect(sent).toBe(true);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
        for (const [, init] of fetchMock.mock.calls) {
            const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as { content?: string };
            expect((body.content ?? "").length).toBeLessThanOrEqual(120);
            expect((((body.content ?? "").match(/```/g) ?? []).length) % 2).toBe(0);
        }
    });

    it("falls back to persisted current conversation binding when proactive target is omitted", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
            ok: true,
            text: async () => "",
        }));
        vi.stubGlobal("fetch", fetchMock);

        const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "qq-binding-"));
        const channel = new QqChannel({
            appId: "app-id",
            appSecret: "app-secret",
            sandbox: true,
            agent: { async *run() {} } as any,
            conversationStore: new ConversationStore(),
            currentConversationBindingStore: createFileCurrentConversationBindingStore(path.join(stateDir, "bindings.json")),
        });

        try {
            (channel as any).accessToken = "qq-token";

            await (channel as any).handleMessage({
                id: "msg-1",
                content: "seed",
                channel_id: "channel-a",
                guild_id: "guild-a",
                author: {
                    id: "user-a",
                    username: "Alice",
                },
            }, "MESSAGE_CREATE");

            fetchMock.mockClear();
            (channel as any).replyContextByChatId.clear();

            const sent = await channel.sendProactiveMessage("manual");

            expect(sent).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://sandbox.api.sgroup.qq.com/channels/channel-a/messages");
        } finally {
            await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
        }
    });

    it("accepts canonical sessionKey as proactive target", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
            ok: true,
            text: async () => "",
        }));
        vi.stubGlobal("fetch", fetchMock);

        const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "qq-binding-session-key-"));
        const channel = new QqChannel({
            appId: "app-id",
            appSecret: "app-secret",
            sandbox: true,
            agent: { async *run() {} } as any,
            conversationStore: new ConversationStore(),
            currentConversationBindingStore: createFileCurrentConversationBindingStore(path.join(stateDir, "bindings.json")),
        });

        try {
            (channel as any).accessToken = "qq-token";

            await (channel as any).handleMessage({
                id: "msg-1",
                content: "seed",
                channel_id: "channel-a",
                guild_id: "guild-a",
                author: {
                    id: "user-a",
                    username: "Alice",
                },
            }, "MESSAGE_CREATE");

            fetchMock.mockClear();
            (channel as any).replyContextByChatId.clear();

            const session = buildChannelSessionDescriptor({
                channel: "qq",
                chatKind: "channel",
                chatId: "channel-a",
                senderId: "user-a",
            });
            const sent = await channel.sendProactiveMessage("manual", { sessionKey: session.sessionKey });

            expect(sent).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://sandbox.api.sgroup.qq.com/channels/channel-a/messages");
        } finally {
            await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
        }
    });

    it("does not backfill binding-only proactive target from in-memory reply context", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
            ok: true,
            text: async () => "",
        }));
        vi.stubGlobal("fetch", fetchMock);

        const channel = new QqChannel({
            appId: "app-id",
            appSecret: "app-secret",
            sandbox: true,
            agent: { async *run() {} } as any,
            conversationStore: new ConversationStore(),
            currentConversationBindingStore: {
                async upsert() {},
                async get() {
                    return undefined;
                },
                async getLatestByChannel() {
                    return {
                        channel: "qq",
                        sessionKey: "channel=qq:scope=per-channel-peer:chat=channel-bind:peer=user-bind",
                        sessionScope: "per-channel-peer",
                        legacyConversationId: "qq_channel-bind",
                        chatKind: "channel",
                        chatId: "channel-bind",
                        updatedAt: Date.now(),
                        target: {},
                    };
                },
            },
        });

        (channel as any).accessToken = "qq-token";
        (channel as any).replyContextByChatId.set("channel-bind", {
            channelId: "channel-bind",
            guildId: "guild-bind",
            messageId: "msg-bind",
            eventType: "MESSAGE_CREATE",
        });

        const sent = await channel.sendProactiveMessage("manual");

        expect(sent).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not fall back to in-memory reply context when binding is missing", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
            ok: true,
            text: async () => "",
        }));
        vi.stubGlobal("fetch", fetchMock);

        const channel = new QqChannel({
            appId: "app-id",
            appSecret: "app-secret",
            sandbox: true,
            agent: { async *run() {} } as any,
            conversationStore: new ConversationStore(),
        });

        (channel as any).accessToken = "qq-token";
        (channel as any).replyContextByChatId.set("channel-legacy", {
            channelId: "channel-legacy",
            guildId: "guild-legacy",
            messageId: "msg-legacy",
            eventType: "MESSAGE_CREATE",
        });

        const sent = await channel.sendProactiveMessage("manual");

        expect(sent).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("cancels a pending reconnect timer on stop", async () => {
        vi.useFakeTimers();

        const channel = new QqChannel({
            appId: "app-id",
            appSecret: "app-secret",
            sandbox: true,
            agent: { async *run() {} } as any,
            conversationStore: new ConversationStore(),
        });

        const connectSpy = vi.spyOn(channel as any, "connectWebSocket").mockResolvedValue(undefined);
        (channel as any)._running = true;
        (channel as any).scheduleReconnect(1000);

        await channel.stop();
        await vi.advanceTimersByTimeAsync(1000);

        expect(connectSpy).not.toHaveBeenCalled();
    });
});
