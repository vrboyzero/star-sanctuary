import { describe, expect, it } from "vitest";
import { selectPreferredPage, waitForPreferredPageSelection } from "./tools.js";

function createPage(url: string, targetId: string) {
  return {
    url: () => url,
    isClosed: () => false,
    target: () => ({ _targetId: targetId }),
  };
}

describe("browser page selection", () => {
  it("prefers the remembered target id over page order", () => {
    const pages = [
      createPage("https://example.com/older", "page-old"),
      createPage("https://search.bilibili.com/all?keyword=openclaw", "page-search"),
    ];

    const selected = selectPreferredPage(pages, {
      preferredTargetId: "page-search",
    });

    expect(selected?.url()).toBe("https://search.bilibili.com/all?keyword=openclaw");
  });

  it("falls back to the latest open page when there is no remembered target", () => {
    const pages = [
      createPage("https://example.com/older", "page-old"),
      createPage("https://example.com/newer", "page-new"),
    ];

    const selected = selectPreferredPage(pages, {});

    expect(selected?.url()).toBe("https://example.com/newer");
  });

  it("aborts preferred page polling when abortSignal is triggered", async () => {
    const controller = new AbortController();
    const waitPromise = waitForPreferredPageSelection({
      listPages: async () => [],
      preferred: {},
      timeoutMs: 5_000,
      signal: controller.signal,
    });

    setTimeout(() => controller.abort("Stopped by user."), 50);

    await expect(waitPromise).rejects.toThrow("Stopped by user.");
  });
});
