import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capturedImageUnderstandMocks = vi.hoisted(() => ({
  understandCapturedImageArtifact: vi.fn(),
}));

vi.mock("../multimedia/captured-image-understand.js", () => ({
  understandCapturedImageArtifact: capturedImageUnderstandMocks.understandCapturedImageArtifact,
}));

import { BrowserManager, browserScreenshotTool } from "./tools.js";

describe("browser_screenshot", () => {
  beforeEach(() => {
    capturedImageUnderstandMocks.understandCapturedImageArtifact.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns screenshot path and image understanding payload", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "browser-screenshot-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-screenshot-state-"));
    const screenshotMock = vi.fn(async ({ path: filePath }: { path: string }) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from("png-bytes"));
    });

    vi.spyOn(BrowserManager, "getInstance").mockReturnValue({
      getPage: vi.fn(async () => ({
        url: () => "https://example.com/dashboard",
        screenshot: screenshotMock,
      })),
    } as unknown as BrowserManager);
    capturedImageUnderstandMocks.understandCapturedImageArtifact.mockResolvedValue({
      status: "completed",
      preview: "图片识别摘要: 页面包含状态面板。",
      result: {
        summary: "页面显示一个状态面板。",
        tags: ["dashboard"],
        content: "页面显示一个状态面板。",
        keyRegions: [],
        focusMode: "overview",
        provider: "openai",
        model: "gpt-4.1-mini",
        mimeType: "image/png",
        sourcePath: path.join(workspaceRoot, "screenshots", "dashboard.png"),
      },
    });

    try {
      const result = await browserScreenshotTool.execute({
        name: "dashboard",
      }, {
        conversationId: "conv-browser",
        workspaceRoot,
        stateDir,
        policy: {
          allowedPaths: [],
          deniedPaths: [],
          allowedDomains: [],
          deniedDomains: [],
          maxTimeoutMs: 5_000,
          maxResponseBytes: 1024 * 1024,
        },
      });

      expect(result.success).toBe(true);
      expect(screenshotMock).toHaveBeenCalledTimes(1);
      expect(capturedImageUnderstandMocks.understandCapturedImageArtifact).toHaveBeenCalledWith(expect.objectContaining({
        stateDir,
        mimeType: "image/png",
        autoUnderstandEnvName: "BELLDANDY_BROWSER_SCREENSHOT_AUTO_UNDERSTAND",
      }));

      const payload = JSON.parse(result.output);
      expect(payload.pageUrl).toBe("https://example.com/dashboard");
      expect(payload.imageUnderstandingStatus).toBe("completed");
      expect(payload.imageUnderstandingPreview).toContain("图片识别摘要");
      expect(payload.path).toContain(path.join("screenshots", "dashboard_"));
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("keeps the screenshot tool successful when image understanding fails", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "browser-screenshot-"));
    const screenshotMock = vi.fn(async ({ path: filePath }: { path: string }) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from("png-bytes"));
    });

    vi.spyOn(BrowserManager, "getInstance").mockReturnValue({
      getPage: vi.fn(async () => ({
        url: () => "https://example.com/failure",
        screenshot: screenshotMock,
      })),
    } as unknown as BrowserManager);
    capturedImageUnderstandMocks.understandCapturedImageArtifact.mockResolvedValue({
      status: "failed",
      error: "vision timeout",
    });

    try {
      const result = await browserScreenshotTool.execute({}, {
        conversationId: "conv-browser",
        workspaceRoot,
        policy: {
          allowedPaths: [],
          deniedPaths: [],
          allowedDomains: [],
          deniedDomains: [],
          maxTimeoutMs: 5_000,
          maxResponseBytes: 1024 * 1024,
        },
      });

      expect(result.success).toBe(true);
      const payload = JSON.parse(result.output);
      expect(payload.imageUnderstandingStatus).toBe("failed");
      expect(payload.imageUnderstandingError).toBe("vision timeout");
      expect(payload.path).toContain(path.join("screenshots", "screenshot-"));
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    }
  });
});
