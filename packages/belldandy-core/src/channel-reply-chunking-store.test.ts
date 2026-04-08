import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  getChannelReplyChunkingConfigContent,
  parseChannelReplyChunkingConfigContent,
  writeChannelReplyChunkingConfig,
} from "./channel-reply-chunking-store.js";

describe("channel reply chunking store", () => {
  it("writes and reads normalized config content", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-reply-chunking-"));
    await writeChannelReplyChunkingConfig(stateDir, parseChannelReplyChunkingConfigContent(JSON.stringify({
      channels: {
        discord: {
          textLimit: 1800,
          chunkMode: "newline",
        },
        community: {
          accounts: {
            alpha: {
              textLimit: 900,
              chunkMode: "length",
            },
          },
        },
      },
    })));

    const result = getChannelReplyChunkingConfigContent(stateDir);
    expect(result.path).toBe(path.join(stateDir, "channel-reply-chunking.json"));
    expect(result.config).toEqual({
      version: 1,
      channels: {
        discord: {
          textLimit: 1800,
          chunkMode: "newline",
        },
        community: {
          accounts: {
            alpha: {
              textLimit: 900,
              chunkMode: "length",
            },
          },
        },
      },
    });
  });
});
