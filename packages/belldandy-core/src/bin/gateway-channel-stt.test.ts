import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { TranscribeOptions, TranscribeResult } from "@belldandy/skills";

import { createCachedChannelSttTranscribe } from "./gateway-channel-stt.js";

describe("createCachedChannelSttTranscribe", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
  });

  it("reuses shared cached transcription results for repeated channel audio", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-stt-"));
    tempDirs.push(stateDir);

    const info = vi.fn();
    const baseTranscribe = vi.fn(async (_opts: TranscribeOptions): Promise<TranscribeResult | null> => ({
      text: "channel cached transcript",
      provider: "test",
      model: "mock-stt",
      durationSec: 1.2,
    }));

    const cachedTranscribe = createCachedChannelSttTranscribe({
      stateDir,
      logger: { info },
      transcribe: baseTranscribe,
    });

    const first = await cachedTranscribe({
      buffer: Buffer.from("same-channel-audio"),
      fileName: "feishu_audio_a.m4a",
      mime: "audio/mp4",
    });
    const second = await cachedTranscribe({
      buffer: Buffer.from("same-channel-audio"),
      fileName: "feishu_audio_b.m4a",
      mime: "audio/mp4",
    });

    expect(baseTranscribe).toHaveBeenCalledTimes(1);
    expect(first?.text).toBe("channel cached transcript");
    expect(second?.text).toBe("channel cached transcript");
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls[0]?.[1]).not.toContain("[cache]");
    expect(info.mock.calls[1]?.[1]).toContain("[cache]");
  });
});
