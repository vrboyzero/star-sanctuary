import { describe, expect, it } from "vitest";

import { buildOpenAIChatCompletionsUrl } from "./openai-url.js";

describe("buildOpenAIChatCompletionsUrl", () => {
  it("appends /v1/chat/completions for bare base URLs", () => {
    expect(buildOpenAIChatCompletionsUrl("https://api.openai.com")).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("reuses versioned base URLs without duplicating /v1", () => {
    expect(buildOpenAIChatCompletionsUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/chat/completions");
    expect(buildOpenAIChatCompletionsUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("keeps explicit chat completions endpoints unchanged", () => {
    expect(buildOpenAIChatCompletionsUrl("https://api.openai.com/v1/chat/completions")).toBe("https://api.openai.com/v1/chat/completions");
  });
});
