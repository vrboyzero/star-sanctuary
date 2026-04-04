import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIChatAgent } from "./openai.js";
import type { SystemPromptSection } from "./system-prompt.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function collectItems(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
  const items: unknown[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe("OpenAIChatAgent prompt snapshot", () => {
  it("captures provider-native system blocks for single-text provider inspection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({
      choices: [{
        message: {
          content: "done",
        },
      }],
    }));

    const snapshots: any[] = [];
    const sections: SystemPromptSection[] = [
      {
        id: "core",
        label: "core",
        source: "core",
        priority: 0,
        text: "You are Belldandy.",
      },
      {
        id: "methodology",
        label: "methodology",
        source: "methodology",
        priority: 100,
        text: "# Methodology",
      },
    ];

    const agent = new OpenAIChatAgent({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
      stream: false,
      systemPrompt: "You are Belldandy.\n# Methodology",
      systemPromptSections: sections,
      onPromptSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    const items = await collectItems(agent.run({
      conversationId: "conv-openai-snapshot",
      text: "hello",
      meta: {
        runId: "run-openai-snapshot",
        promptDeltas: [
          {
            id: "attachment-1",
            deltaType: "attachment",
            role: "attachment",
            text: "[Attachment]",
          },
        ],
      },
    }));

    expect(items).toContainEqual({ type: "final", text: "done" });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      conversationId: "conv-openai-snapshot",
      runId: "run-openai-snapshot",
      providerNativeSystemBlocks: [
        {
          blockType: "static-persona",
          sourceSectionIds: ["core"],
          sourceDeltaIds: [],
          cacheControlEligible: true,
        },
        {
          blockType: "static-capability",
          sourceSectionIds: ["methodology"],
          sourceDeltaIds: [],
          cacheControlEligible: true,
        },
      ],
      deltas: [
        {
          id: "attachment-1",
          deltaType: "attachment",
          role: "attachment",
          text: "[Attachment]",
        },
      ],
    });
  });
});
