import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadChannelRouterConfig } from "./config.js";

describe("channel router config loader", () => {
  it("returns empty config when file does not exist", () => {
    const filePath = path.join(os.tmpdir(), `router-config-not-found-${Date.now()}.json`);
    const config = loadChannelRouterConfig(filePath);
    expect(config.rules).toEqual([]);
  });

  it("returns empty config when file is invalid json", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "router-config-test-"));
    const filePath = path.join(dir, "invalid.json");
    await fs.writeFile(filePath, "{invalid-json", "utf-8");

    try {
      const config = loadChannelRouterConfig(filePath);
      expect(config.rules).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("loads valid rules from json file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "router-config-test-"));
    const filePath = path.join(dir, "channels-routing.json");
    await fs.writeFile(filePath, JSON.stringify({
      version: 1,
      defaultAction: { allow: true, agentId: "default" },
      rules: [
        {
          id: "r1",
          enabled: true,
          priority: 10,
          match: { channels: ["discord"], mentionRequired: true },
          action: { allow: true, agentId: "ops" },
        },
      ],
    }), "utf-8");

    try {
      const config = loadChannelRouterConfig(filePath);
      expect(config.rules).toHaveLength(1);
      expect(config.rules[0].id).toBe("r1");
      expect(config.defaultAction?.agentId).toBe("default");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

