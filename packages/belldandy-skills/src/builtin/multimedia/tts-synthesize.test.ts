import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { synthesizeSpeech } from "./tts-synthesize.js";

const { edgeTtsPromiseMock, openAISpeechCreateMock } = vi.hoisted(() => ({
  edgeTtsPromiseMock: vi.fn(),
  openAISpeechCreateMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    audio: {
      speech: {
        create: openAISpeechCreateMock,
      },
    },
  })),
}));

vi.mock("node-edge-tts", () => ({
  EdgeTTS: vi.fn().mockImplementation(() => ({
    ttsPromise: edgeTtsPromiseMock,
  })),
}));

describe("tts-synthesize", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-tts-test-"));
    process.env.DASHSCOPE_API_KEY = "dashscope-test-key";
    edgeTtsPromiseMock.mockReset();
    openAISpeechCreateMock.mockReset();
    edgeTtsPromiseMock.mockImplementation(async (_text: string, filePath: string) => {
      await fs.writeFile(filePath, Buffer.from("edge-test-audio"));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.BELLDANDY_TTS_OPENAI_API_KEY;
    delete process.env.BELLDANDY_TTS_OPENAI_BASE_URL;
    delete process.env.BELLDANDY_OPENAI_API_KEY;
    delete process.env.BELLDANDY_OPENAI_BASE_URL;
    delete process.env.BELLDANDY_TTS_PROVIDER;
    delete process.env.BELLDANDY_TTS_VOICE;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("uses BELLDANDY_OPENAI_* config for OpenAI provider", async () => {
    process.env.BELLDANDY_OPENAI_API_KEY = "sk-bdd";
    process.env.BELLDANDY_OPENAI_BASE_URL = "https://example.invalid/v1";
    process.env.BELLDANDY_TTS_PROVIDER = "dashscope";
    process.env.BELLDANDY_TTS_VOICE = "Chelsie";
    openAISpeechCreateMock.mockResolvedValue({
      arrayBuffer: vi.fn(async () => Uint8Array.from([1, 2, 3, 4]).buffer),
    });

    const result = await synthesizeSpeech({
      text: "Hello world",
      stateDir: tempDir,
      provider: "OpenAI",
    });

    expect(result).not.toBeNull();
    expect(result?.webPath).toMatch(/\.mp3$/);
    expect(vi.mocked(OpenAI)).toHaveBeenCalledWith({
      apiKey: "sk-bdd",
      baseURL: "https://example.invalid/v1",
    });
    expect(openAISpeechCreateMock).toHaveBeenCalledTimes(1);
    const firstCall = openAISpeechCreateMock.mock.calls[0]?.[0];
    expect(firstCall?.voice).toBe("alloy");
  });

  it("prefers BELLDANDY_TTS_OPENAI_* over global OpenAI config", async () => {
    process.env.BELLDANDY_TTS_OPENAI_API_KEY = "sk-tts";
    process.env.BELLDANDY_TTS_OPENAI_BASE_URL = "https://tts.example.invalid/v1";
    process.env.BELLDANDY_OPENAI_API_KEY = "sk-main";
    process.env.BELLDANDY_OPENAI_BASE_URL = "https://main.example.invalid/v1";
    openAISpeechCreateMock.mockResolvedValue({
      arrayBuffer: vi.fn(async () => Uint8Array.from([1, 2, 3, 4]).buffer),
    });

    const result = await synthesizeSpeech({
      text: "Hello TTS",
      stateDir: tempDir,
      provider: "openai",
    });

    expect(result).not.toBeNull();
    expect(vi.mocked(OpenAI)).toHaveBeenCalledWith({
      apiKey: "sk-tts",
      baseURL: "https://tts.example.invalid/v1",
    });
  });

  it("uses DashScope default Cherry voice and mp3 extension", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: {
          audio: {
            url: "https://example.invalid/audio.mp3",
          },
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(Uint8Array.from({ length: 256 }, (_, index) => index % 255), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeSpeech({
      text: "你好，世界",
      stateDir: tempDir,
      provider: "DashScope",
    });

    expect(result).not.toBeNull();
    expect(result?.webPath).toMatch(/\.mp3$/);
    const firstRequestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof firstRequestBody).toBe("string");
    const parsedBody = JSON.parse(firstRequestBody as string);
    expect(parsedBody.input.voice).toBe("Cherry");
  });

  it("aborts DashScope synthesis when abortSignal is triggered", async () => {
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

    const resultPromise = synthesizeSpeech({
      text: "Hello world",
      stateDir: tempDir,
      provider: "dashscope",
      abortSignal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.abort("Stopped by user.");

    await expect(resultPromise).rejects.toThrow("Stopped by user.");
  });
});
