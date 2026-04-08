import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  approveChannelSecurityApprovalRequest,
  getChannelSecurityConfigContent,
  parseChannelSecurityConfigContent,
  readChannelSecurityApprovalStore,
  rejectChannelSecurityApprovalRequest,
  upsertChannelSecurityApprovalRequest,
  writeChannelSecurityConfig,
} from "./channel-security-store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("channel security store", () => {
  it("round-trips normalized config content", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-security-store-"));
    tempDirs.push(stateDir);

    await writeChannelSecurityConfig(stateDir, parseChannelSecurityConfigContent(JSON.stringify({
      channels: {
        discord: {
          dmPolicy: "allowlist",
          allowFrom: ["u-1", "u-1", "u-2"],
          mentionRequired: true,
        },
      },
    })));

    const result = getChannelSecurityConfigContent(stateDir);
    expect(result.config.channels.discord?.allowFrom).toEqual(["u-1", "u-2"]);
    expect(result.content).toContain("\"discord\"");
  });

  it("upserts and approves pending sender requests into allowFrom", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-security-store-"));
    tempDirs.push(stateDir);

    await writeChannelSecurityConfig(stateDir, parseChannelSecurityConfigContent(JSON.stringify({
      channels: {
        discord: {
          dmPolicy: "allowlist",
          allowFrom: [],
          mentionRequired: { channel: true },
        },
      },
    })));

    const first = await upsertChannelSecurityApprovalRequest(stateDir, {
      channel: "discord",
      senderId: "u-1",
      senderName: "Alice",
      chatId: "dm-1",
      chatKind: "dm",
      messagePreview: "hello there",
    });
    const second = await upsertChannelSecurityApprovalRequest(stateDir, {
      channel: "discord",
      senderId: "u-1",
      senderName: "Alice",
      chatId: "dm-1",
      chatKind: "dm",
      messagePreview: "hello again",
    });

    expect(second.id).toBe(first.id);
    expect(second.seenCount).toBe(2);

    const approved = await approveChannelSecurityApprovalRequest(stateDir, first.id);
    expect(approved.config.channels.discord?.allowFrom).toContain("u-1");
    expect((await readChannelSecurityApprovalStore(stateDir)).pending).toHaveLength(0);
  });

  it("approves pending senders into the matching account scope", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-security-store-"));
    tempDirs.push(stateDir);

    await writeChannelSecurityConfig(stateDir, parseChannelSecurityConfigContent(JSON.stringify({
      channels: {
        community: {
          mentionRequired: { room: true },
          accounts: {
            alpha: {
              dmPolicy: "allowlist",
              allowFrom: ["u-safe"],
            },
          },
        },
      },
    })));

    const request = await upsertChannelSecurityApprovalRequest(stateDir, {
      channel: "community",
      accountId: "alpha",
      senderId: "u-new",
      senderName: "Alice",
      chatId: "dm-alpha",
      chatKind: "dm",
      messagePreview: "hello alpha",
    });

    const approved = await approveChannelSecurityApprovalRequest(stateDir, request.id);
    expect(approved.config.channels.community?.accounts?.alpha?.allowFrom).toEqual(["u-safe", "u-new"]);
    expect(approved.config.channels.community?.allowFrom).toBeUndefined();
  });

  it("can reject a pending request without mutating allowFrom", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-security-store-"));
    tempDirs.push(stateDir);

    const request = await upsertChannelSecurityApprovalRequest(stateDir, {
      channel: "qq",
      senderId: "u-2",
      chatId: "dm-2",
      chatKind: "dm",
      messagePreview: "ping",
    });

    await rejectChannelSecurityApprovalRequest(stateDir, request.id);

    const config = getChannelSecurityConfigContent(stateDir).config;
    expect(config.channels.qq?.allowFrom ?? []).not.toContain("u-2");
    expect((await readChannelSecurityApprovalStore(stateDir)).pending).toHaveLength(0);
  });
});
