import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types.js";
import { webSearchTool } from "./index.js";

describe("web_search tool", () => {
  const context: ToolContext = {
    conversationId: "conv-web-search",
    workspaceRoot: "/tmp/test",
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 5_000,
      maxResponseBytes: 1024 * 1024,
    },
  };

  beforeEach(() => {
    process.env.BRAVE_API_KEY = "brave-test-key";
    delete process.env.SERPAPI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.BRAVE_API_KEY;
    delete process.env.SERPAPI_API_KEY;
  });

  it("stops an in-flight provider request when abortSignal is aborted", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          const error = new Error("Stopped by user.");
          error.name = "AbortError";
          reject(error);
          return;
        }
        signal?.addEventListener("abort", () => {
          const error = new Error("Stopped by user.");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }));
    const controller = new AbortController();

    const resultPromise = webSearchTool.execute({
      query: "belldandy tools",
    }, {
      ...context,
      abortSignal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.abort("Stopped by user.");
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toBe("Stopped by user.");
    expect(result.failureKind).toBe("environment_error");
  });

  it("classifies missing query as input_error", async () => {
    const result = await webSearchTool.execute({
      query: "",
    }, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain("query 必须是非空字符串");
    expect(result.failureKind).toBe("input_error");
  });
});
