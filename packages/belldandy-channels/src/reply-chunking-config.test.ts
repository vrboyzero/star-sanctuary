import { describe, expect, it } from "vitest";

import {
  normalizeReplyChunkingConfig,
  resolveChannelReplyChunkingPolicy,
} from "./reply-chunking-config.js";

describe("reply chunking config", () => {
  it("normalizes supported channel and account overrides", () => {
    const config = normalizeReplyChunkingConfig({
      channels: {
        community: {
          textLimit: 3200,
          chunkMode: "newline",
          accounts: {
            alpha: {
              textLimit: 1800,
              chunkMode: "length",
            },
          },
        },
        qq: {
          chunkMode: "length",
        },
      },
    });

    expect(resolveChannelReplyChunkingPolicy(config, "community")).toEqual({
      textLimit: 3200,
      chunkMode: "newline",
    });
    expect(resolveChannelReplyChunkingPolicy(config, "community", "alpha")).toEqual({
      textLimit: 1800,
      chunkMode: "length",
    });
    expect(resolveChannelReplyChunkingPolicy(config, "qq")).toEqual({
      chunkMode: "length",
    });
  });

  it("ignores unsupported values and empty entries", () => {
    const config = normalizeReplyChunkingConfig({
      channels: {
        discord: {
          textLimit: -1,
          chunkMode: "invalid",
        },
        community: {
          accounts: {
            "": {
              textLimit: 10,
            },
          },
        },
      },
    });

    expect(config).toEqual({
      version: 1,
      channels: {},
    });
  });
});
