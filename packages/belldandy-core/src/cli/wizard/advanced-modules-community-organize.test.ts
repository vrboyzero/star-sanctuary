import { describe, expect, test } from "vitest";
import type { CommunityAgentConfig } from "@belldandy/channels";

import {
  removeCommunityAgents,
  sortCommunityAgents,
  updateCommunityAgentsOffice,
  updateCommunityAgentsRoom,
} from "./advanced-modules-community-organize.js";

function createAgent(input: Partial<CommunityAgentConfig> & Pick<CommunityAgentConfig, "name" | "apiKey">): CommunityAgentConfig {
  return {
    name: input.name,
    apiKey: input.apiKey,
    ...(input.room ? { room: input.room } : {}),
    ...(input.office ? { office: input.office } : {}),
  };
}

describe("advanced-modules-community-organize", () => {
  test("sortCommunityAgents supports room and office-oriented ordering", () => {
    const agents = [
      createAgent({
        name: "charlie",
        apiKey: "sk-charlie",
        room: { name: "z-room" },
      }),
      createAgent({
        name: "alpha",
        apiKey: "sk-alpha",
        office: {
          downloadDir: "downloads",
          uploadRoots: ["docs"],
        },
      }),
      createAgent({
        name: "bravo",
        apiKey: "sk-bravo",
        room: { name: "a-room" },
      }),
    ];

    expect(sortCommunityAgents(agents, "sort_room").map((item) => item.name)).toEqual(["bravo", "alpha", "charlie"]);
    expect(sortCommunityAgents(agents, "sort_office").map((item) => item.name)).toEqual(["alpha", "bravo", "charlie"]);
  });

  test("removeCommunityAgents removes multiple agents by name", () => {
    const next = removeCommunityAgents([
      createAgent({ name: "alpha", apiKey: "sk-alpha" }),
      createAgent({ name: "bravo", apiKey: "sk-bravo" }),
      createAgent({ name: "charlie", apiKey: "sk-charlie" }),
    ], ["alpha", "charlie"]);

    expect(next).toEqual([
      expect.objectContaining({ name: "bravo" }),
    ]);
  });

  test("updateCommunityAgentsRoom updates and clears room fields in batch", () => {
    const agents = [
      createAgent({ name: "alpha", apiKey: "sk-alpha" }),
      createAgent({ name: "bravo", apiKey: "sk-bravo", room: { name: "old-room", password: "secret" } }),
    ];

    expect(updateCommunityAgentsRoom(agents, ["alpha", "bravo"], {
      roomName: "shared-room",
      roomPassword: "shared-secret",
    })).toEqual([
      expect.objectContaining({ name: "alpha", room: { name: "shared-room", password: "shared-secret" } }),
      expect.objectContaining({ name: "bravo", room: { name: "shared-room", password: "shared-secret" } }),
    ]);

    const cleared = updateCommunityAgentsRoom(agents, ["bravo"], {});
    expect(cleared.map((item) => item.name)).toEqual(["alpha", "bravo"]);
    expect(cleared[0]?.room).toBeUndefined();
    expect(cleared[1]?.room).toBeUndefined();
  });

  test("updateCommunityAgentsOffice updates and clears office fields in batch", () => {
    const agents = [
      createAgent({ name: "alpha", apiKey: "sk-alpha" }),
      createAgent({
        name: "bravo",
        apiKey: "sk-bravo",
        office: {
          downloadDir: "old-downloads",
          uploadRoots: ["old-root"],
        },
      }),
    ];

    expect(updateCommunityAgentsOffice(agents, ["alpha", "bravo"], {
      downloadDir: "downloads",
      uploadRoots: ["docs", "assets"],
    })).toEqual([
      expect.objectContaining({ name: "alpha", office: { downloadDir: "downloads", uploadRoots: ["docs", "assets"] } }),
      expect.objectContaining({ name: "bravo", office: { downloadDir: "downloads", uploadRoots: ["docs", "assets"] } }),
    ]);

    const cleared = updateCommunityAgentsOffice(agents, ["bravo"], {});
    expect(cleared.map((item) => item.name)).toEqual(["alpha", "bravo"]);
    expect(cleared[0]?.office).toBeUndefined();
    expect(cleared[1]?.office).toBeUndefined();
  });
});
