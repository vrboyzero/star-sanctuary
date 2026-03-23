import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationStore } from "@belldandy/agent";

import { QqChannel } from "./qq.js";

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
            async *run(input: { text: string }) {
                if (input.text === "first") {
                    await sleep(20);
                }
                yield {
                    type: "final" as const,
                    text: `reply:${input.text}`,
                };
            },
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
