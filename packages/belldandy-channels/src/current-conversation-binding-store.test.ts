import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createFileCurrentConversationBindingStore } from "./current-conversation-binding-store.js";

describe("current conversation binding store", () => {
  it("persists latest binding and resolves by channel/account scope", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "binding-store-"));
    const filePath = path.join(stateDir, "current-conversation-bindings.json");
    const store = createFileCurrentConversationBindingStore(filePath);

    try {
      await store.upsert({
        channel: "community",
        sessionKey: "channel=community:scope=per-account-channel-peer:chat=room-1:account=alpha:peer=user-1",
        sessionScope: "per-account-channel-peer",
        legacyConversationId: "community:room-1",
        chatKind: "room",
        chatId: "room-1",
        accountId: "alpha",
        peerId: "user-1",
        updatedAt: 123,
        target: {
          roomId: "room-1",
          accountId: "alpha",
        },
      });
      await store.upsert({
        channel: "community",
        sessionKey: "channel=community:scope=per-account-channel-peer:chat=room-2:account=beta:peer=user-2",
        sessionScope: "per-account-channel-peer",
        legacyConversationId: "community:room-2",
        chatKind: "room",
        chatId: "room-2",
        accountId: "beta",
        peerId: "user-2",
        updatedAt: 456,
        target: {
          roomId: "room-2",
          accountId: "beta",
        },
      });

      const reloaded = createFileCurrentConversationBindingStore(filePath);
      await expect(reloaded.get("channel=community:scope=per-account-channel-peer:chat=room-1:account=alpha:peer=user-1")).resolves.toMatchObject({
        legacyConversationId: "community:room-1",
        target: {
          roomId: "room-1",
          accountId: "alpha",
        },
      });
      await expect(reloaded.getLatestByChannel({ channel: "community" })).resolves.toMatchObject({
        chatId: "room-2",
      });
      await expect(reloaded.getLatestByChannel({ channel: "community", accountId: "alpha" })).resolves.toMatchObject({
        chatId: "room-1",
      });
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
