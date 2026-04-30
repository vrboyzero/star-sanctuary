import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { understandVideoFileByFrameSampling } from "./video-frame-fallback.js";

describe("video-frame-fallback", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-video-fallback-"));
    process.env.BELLDANDY_IMAGE_UNDERSTAND_ENABLED = "true";
    process.env.BELLDANDY_IMAGE_UNDERSTAND_OPENAI_API_KEY = "sk-image";
    process.env.BELLDANDY_IMAGE_UNDERSTAND_MODEL = "gpt-4.1-mini";
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    delete process.env.BELLDANDY_IMAGE_UNDERSTAND_ENABLED;
    delete process.env.BELLDANDY_IMAGE_UNDERSTAND_OPENAI_API_KEY;
    delete process.env.BELLDANDY_IMAGE_UNDERSTAND_MODEL;
    vi.restoreAllMocks();
  });

  it("aggregates extracted frame understandings into timeline and target moment results", async () => {
    const videoPath = path.join(tempDir, "clip.mp4");
    await fs.writeFile(videoPath, Buffer.from("fake-video"));

    const runCommand = vi.fn(async (input: { command: string; args: string[] }) => {
      if (input.command.includes("ffprobe")) {
        return {
          exitCode: 0,
          stdout: "18.0\n",
          stderr: "",
        };
      }
      const outputPath = input.args[input.args.length - 1];
      await fs.writeFile(outputPath, Buffer.from(`frame:${path.basename(outputPath)}`));
      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
      };
    });
    const understandFrame = vi.fn(async (input: { timestampText: string }) => ({
      summary: `${input.timestampText} 的画面展示产品界面变化。`,
      tags: ["demo", input.timestampText],
      ocrText: input.timestampText === "00:09" ? "START" : undefined,
      content: `${input.timestampText} 的画面展示产品界面变化。`,
      keyRegions: [],
      targetDetail: input.timestampText === "00:09"
        ? {
          target: "视频在约 00:09 的画面内容",
          summary: "此时开始点击主按钮并进入演示步骤。",
          ocrText: "START",
          note: "基于抽帧近似判断。",
        }
        : undefined,
      focusMode: "overview" as const,
      focusTarget: undefined,
      provider: "openai",
      model: "gpt-4.1-mini",
      mimeType: "image/jpeg",
      sourcePath: path.join(tempDir, `${input.timestampText}.jpg`),
    }));

    const result = await understandVideoFileByFrameSampling({
      filePath: videoPath,
      mimeType: "video/mp4",
      focusMode: "timestamp_query",
      targetTimestamp: "00:09",
      includeTimeline: true,
      maxTimelineItems: 4,
      nativeErrorMessage: "Upload failed: 415 unsupported media",
    }, {
      runCommand,
      understandFrame,
    });

    expect(runCommand).toHaveBeenCalled();
    expect(understandFrame).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      provider: "frame_fallback",
      model: "gpt-4.1-mini",
      durationText: "约 18 秒",
      tags: expect.arrayContaining(["demo"]),
      timeline: [
        expect.objectContaining({ timestamp: "00:07" }),
        expect.objectContaining({ timestamp: "00:09" }),
        expect.objectContaining({ timestamp: "00:11" }),
      ],
      targetMoment: {
        requestedTimestamp: "00:09",
        matchedTimestamp: "00:09",
        summary: "此时开始点击主按钮并进入演示步骤。",
        ocrText: "START",
      },
    });
    expect(result.content).toContain("已切换到视频抽帧兜底识别。");
    expect(result.content).toContain("原生视频识别失败原因：Upload failed: 415 unsupported media");
  });
});
