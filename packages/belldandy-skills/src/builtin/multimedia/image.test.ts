import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { imageGenerateTool } from "./image.js";
import type { ToolContext } from "../../types.js";

const { imageGenerateMock, openAIMock } = vi.hoisted(() => ({
  imageGenerateMock: vi.fn(),
  openAIMock: vi.fn(() => ({
    images: {
      generate: imageGenerateMock,
    },
  })),
}));

vi.mock("openai", () => ({
  default: openAIMock,
}));

function createContext(workspaceRoot: string): ToolContext {
  return {
    conversationId: "conv-image-test",
    workspaceRoot,
    stateDir: workspaceRoot,
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 60000,
      maxResponseBytes: 1024 * 1024,
    },
  };
}

describe("image_generate", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-image-test-"));
    imageGenerateMock.mockReset();
    openAIMock.mockClear();
    delete process.env.BELLDANDY_IMAGE_ENABLED;
    delete process.env.BELLDANDY_IMAGE_PROVIDER;
    delete process.env.BELLDANDY_IMAGE_OPENAI_API_KEY;
    delete process.env.BELLDANDY_IMAGE_OPENAI_BASE_URL;
    delete process.env.BELLDANDY_IMAGE_MODEL;
    delete process.env.BELLDANDY_IMAGE_OUTPUT_FORMAT;
    delete process.env.BELLDANDY_IMAGE_TIMEOUT_MS;
    delete process.env.BELLDANDY_OPENAI_API_KEY;
    delete process.env.BELLDANDY_OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires BELLDANDY_IMAGE_OPENAI_API_KEY and does not fall back to global OpenAI env", async () => {
    process.env.BELLDANDY_OPENAI_API_KEY = "sk-main";
    process.env.OPENAI_API_KEY = "sk-legacy";

    const result = await imageGenerateTool.execute({
      prompt: "a lantern under stars",
    }, createContext(tempDir));

    expect(result.success).toBe(false);
    expect(result.error).toContain("BELLDANDY_IMAGE_OPENAI_API_KEY");
    expect(imageGenerateMock).not.toHaveBeenCalled();
  });

  it("writes a generated image into generated/images and returns preview markup", async () => {
    process.env.BELLDANDY_IMAGE_OPENAI_API_KEY = "sk-image";
    process.env.BELLDANDY_IMAGE_OPENAI_BASE_URL = "https://images.example.invalid/v1";
    process.env.BELLDANDY_IMAGE_MODEL = "gpt-image-2";
    process.env.BELLDANDY_IMAGE_OUTPUT_FORMAT = "png";
    imageGenerateMock.mockResolvedValue({
      data: [
        {
          b64_json: Buffer.from("fake-image-bytes").toString("base64"),
        },
      ],
    });

    const result = await imageGenerateTool.execute({
      prompt: "a sanctuary garden at night",
      size: "1024x1024",
    }, createContext(tempDir));

    expect(result.success).toBe(true);
    expect(result.output).toContain("<div class=\"generated-image-result\">");
    expect(result.output).toContain("保存位置：");
    expect(result.output).toContain("#generated-image-reveal:/generated/images/");
    expect(result.metadata).toMatchObject({
      model: "gpt-image-2",
      webPath: expect.stringMatching(/^\/generated\/images\/image-/),
      relativePath: expect.stringMatching(/^generated\/images\/image-/),
      outputFormat: "png",
    });

    const relativePath = String(result.metadata?.relativePath);
    const writtenFile = path.join(tempDir, relativePath);
    await expect(fs.readFile(writtenFile)).resolves.toEqual(Buffer.from("fake-image-bytes"));
    expect(openAIMock).toHaveBeenCalledWith(expect.objectContaining({
      timeout: 60000,
    }));
  });

  it("treats BELLDANDY_IMAGE_TIMEOUT_MS=0 as no belldandy timeout override and reuses one signal for url download", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from("downloaded-image-bytes"),
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.BELLDANDY_IMAGE_OPENAI_API_KEY = "sk-image";
    process.env.BELLDANDY_IMAGE_TIMEOUT_MS = "0";
    imageGenerateMock.mockImplementation(async (_input: unknown, options?: { signal?: AbortSignal }) => ({
      data: [
        {
          url: "https://images.example.invalid/generated.png",
        },
      ],
      _signal: options?.signal,
    }));

    const result = await imageGenerateTool.execute({
      prompt: "a sanctuary garden at dawn",
      output_format: "png",
    }, createContext(tempDir));

    expect(result.success).toBe(true);
    expect(openAIMock).toHaveBeenCalledWith(expect.objectContaining({
      timeout: 2147483647,
    }));
    expect(imageGenerateMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const generateSignal = imageGenerateMock.mock.calls[0]?.[1]?.signal;
    const fetchSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(generateSignal).toBeInstanceOf(AbortSignal);
    expect(fetchSignal).toBe(generateSignal);
  });
});
