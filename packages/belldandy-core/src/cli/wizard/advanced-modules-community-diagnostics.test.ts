import { describe, expect, test } from "vitest";
import type { CommunityAgentConfig } from "@belldandy/channels";

import { buildCommunityReconnectOfficeDiagnostics } from "./advanced-modules-community-diagnostics.js";

function createAgent(input: Partial<CommunityAgentConfig> & Pick<CommunityAgentConfig, "name" | "apiKey">): CommunityAgentConfig {
  return {
    name: input.name,
    apiKey: input.apiKey,
    ...(input.room ? { room: input.room } : {}),
    ...(input.office ? { office: input.office } : {}),
  };
}

describe("advanced-modules-community-diagnostics", () => {
  test("buildCommunityReconnectOfficeDiagnostics summarizes reconnect and office gaps", () => {
    const lines = buildCommunityReconnectOfficeDiagnostics({
      reconnect: {
        enabled: true,
        maxRetries: 0,
        backoffMs: 750,
      },
      agents: [
        createAgent({
          name: "alpha",
          apiKey: "sk-alpha",
          room: { name: "shared-room" },
          office: { downloadDir: "downloads" },
        }),
        createAgent({
          name: "bravo",
          apiKey: "sk-bravo",
          room: { name: "shared-room" },
          office: { uploadRoots: ["docs"] },
        }),
        createAgent({
          name: "charlie",
          apiKey: "sk-charlie",
        }),
      ],
    });

    expect(lines).toEqual(expect.arrayContaining([
      "Reconnect max retries is 0, so each disconnect will stop immediately after the first failure.",
      "Reconnect backoff is 750ms; repeated failures may churn logs and reconnect attempts.",
      "1 agent(s) have no room configured: charlie.",
      "1 agent(s) have no office paths configured: charlie.",
      "1 agent(s) have office downloadDir but no uploadRoots: alpha.",
      "1 agent(s) have office uploadRoots but no downloadDir: bravo.",
      "Multiple agents target the same room: shared-room.",
    ]));
  });
});
