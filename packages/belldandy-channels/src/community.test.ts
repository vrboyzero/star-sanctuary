import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationStore } from "@belldandy/agent";

const { uploadTokenUsageMock } = vi.hoisted(() => ({
  uploadTokenUsageMock: vi.fn(),
}));

vi.mock("@belldandy/protocol", async () => {
  const actual = await vi.importActual<typeof import("@belldandy/protocol")>("@belldandy/protocol");
  return {
    ...actual,
    uploadTokenUsage: uploadTokenUsageMock,
  };
});

import { CommunityChannel } from "./community.js";

describe("community token usage upload", () => {
  beforeEach(() => {
    uploadTokenUsageMock.mockReset();
  });

  it("uploads cumulative usage deltas to the agent owner", async () => {
    const wsSend = vi.fn();
    const agent = {
      run: vi.fn(async function* () {
        yield {
          type: "usage",
          systemPromptTokens: 0,
          contextTokens: 0,
          inputTokens: 10,
          outputTokens: 5,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          modelCalls: 1,
        };
        yield {
          type: "usage",
          systemPromptTokens: 0,
          contextTokens: 0,
          inputTokens: 14,
          outputTokens: 7,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          modelCalls: 2,
        };
        yield { type: "final", text: "收到" };
      }),
    };

    const channel = new CommunityChannel({
      endpoint: "https://office.goddess.ai",
      agents: [],
      agent: agent as any,
      conversationStore: new ConversationStore(),
      tokenUsageUpload: {
        enabled: true,
        url: "https://office.goddess.ai/api/internal/token-usage",
        token: "gro_test_key",
        timeoutMs: 3000,
      },
      ownerUserUuid: "a10001",
    });

    const state = {
      ws: { send: wsSend },
      agentConfig: { name: "贝露丹蒂", apiKey: "gro_test_key" },
      roomId: "room-1",
      reconnectAttempts: 0,
      members: [],
    };

    await (channel as any).handleChatMessage({
      id: "msg-1",
      content: "你好",
      sender: {
        type: "user",
        id: "u-1",
        uid: "u-1",
        name: "Alice",
      },
    }, state);

    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(agent.run).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "community:room-1",
      text: "你好",
      senderInfo: expect.objectContaining({ id: "u-1", name: "Alice", type: "user" }),
      roomContext: expect.objectContaining({ roomId: "room-1", environment: "community" }),
    }));

    expect(uploadTokenUsageMock).toHaveBeenCalledTimes(2);
    expect(uploadTokenUsageMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userUuid: "a10001",
      conversationId: "community:room-1",
      source: "community",
      deltaTokens: 15,
      config: expect.objectContaining({ enabled: true }),
    }));
    expect(uploadTokenUsageMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userUuid: "a10001",
      conversationId: "community:room-1",
      source: "community",
      deltaTokens: 6,
    }));

    expect(wsSend).toHaveBeenCalledTimes(1);
    expect(JSON.parse(wsSend.mock.calls[0][0])).toEqual({
      type: "message",
      data: { content: "收到" },
    });
  });

  it("does not upload usage when token upload is disabled", async () => {
    const agent = {
      run: vi.fn(async function* () {
        yield {
          type: "usage",
          systemPromptTokens: 0,
          contextTokens: 0,
          inputTokens: 8,
          outputTokens: 4,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          modelCalls: 1,
        };
        yield { type: "final", text: "ok" };
      }),
    };

    const channel = new CommunityChannel({
      endpoint: "https://office.goddess.ai",
      agents: [],
      agent: agent as any,
      conversationStore: new ConversationStore(),
      tokenUsageUpload: {
        enabled: false,
        url: "https://office.goddess.ai/api/internal/token-usage",
        token: "gro_test_key",
        timeoutMs: 3000,
      },
      ownerUserUuid: "a10001",
    });

    await (channel as any).handleChatMessage({
      id: "msg-2",
      content: "测试",
      sender: {
        type: "user",
        id: "u-2",
        uid: "u-2",
        name: "Bob",
      },
    }, {
      ws: { send: vi.fn() },
      agentConfig: { name: "贝露丹蒂", apiKey: "gro_test_key" },
      roomId: "room-2",
      reconnectAttempts: 0,
      members: [],
    });

    expect(uploadTokenUsageMock).not.toHaveBeenCalled();
  });

  it("uploads without userUuid when owner uuid is missing, which is the strict-uuid boundary", async () => {
    const agent = {
      run: vi.fn(async function* () {
        yield {
          type: "usage",
          systemPromptTokens: 0,
          contextTokens: 0,
          inputTokens: 6,
          outputTokens: 3,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          modelCalls: 1,
        };
        yield { type: "final", text: "ok" };
      }),
    };

    const channel = new CommunityChannel({
      endpoint: "https://office.goddess.ai",
      agents: [],
      agent: agent as any,
      conversationStore: new ConversationStore(),
      tokenUsageUpload: {
        enabled: true,
        url: "https://office.goddess.ai/api/internal/token-usage",
        token: "gro_test_key",
        timeoutMs: 3000,
      },
    });

    await (channel as any).handleChatMessage({
      id: "msg-3",
      content: "边界测试",
      sender: {
        type: "user",
        id: "u-3",
        uid: "u-3",
        name: "Carol",
      },
    }, {
      ws: { send: vi.fn() },
      agentConfig: { name: "贝露丹蒂", apiKey: "gro_test_key" },
      roomId: "room-3",
      reconnectAttempts: 0,
      members: [],
    });

    expect(uploadTokenUsageMock).toHaveBeenCalledTimes(1);
    expect(uploadTokenUsageMock).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "community:room-3",
      source: "community",
      deltaTokens: 9,
    }));
    expect(uploadTokenUsageMock.mock.calls[0][0].userUuid).toBeUndefined();
  });
});
