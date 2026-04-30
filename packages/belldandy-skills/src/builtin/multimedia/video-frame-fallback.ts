import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  readImageUnderstandConfig,
  understandImageFile,
  type ImageUnderstandResult,
} from "./image-understand.js";

const DEFAULT_FFMPEG_COMMAND = "ffmpeg";
const DEFAULT_FFPROBE_COMMAND = "ffprobe";
const DEFAULT_SAMPLE_COUNT = 5;
const COMMAND_TIMEOUT_MS = 30_000;

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type CommandRunner = (input: {
  command: string;
  args: string[];
  timeoutMs?: number;
}) => Promise<CommandResult>;

type FrameUnderstandingFn = (input: {
  filePath: string;
  timestampText: string;
  focusMode: "overview" | "timeline" | "timestamp_query";
  targetTimestamp?: string;
  abortSignal?: AbortSignal;
}) => Promise<ImageUnderstandResult>;

export type VideoFrameFallbackTimelineEntry = {
  timestamp: string;
  summary: string;
  ocrText?: string;
};

export type VideoFrameFallbackTargetMoment = {
  requestedTimestamp?: string;
  matchedTimestamp?: string;
  summary: string;
  ocrText?: string;
  note?: string;
};

export type VideoFrameFallbackResult = {
  summary: string;
  tags: string[];
  ocrText?: string;
  content: string;
  durationText?: string;
  timeline: VideoFrameFallbackTimelineEntry[];
  targetMoment?: VideoFrameFallbackTargetMoment;
  provider: string;
  model: string;
};

type VideoFrameSample = {
  timestampSec: number;
  timestampText: string;
  imagePath: string;
  result: ImageUnderstandResult;
};

type UnderstandVideoByFramesInput = {
  filePath: string;
  mimeType: string;
  focusMode: "overview" | "timeline" | "timestamp_query";
  targetTimestamp?: string;
  includeTimeline: boolean;
  maxTimelineItems: number;
  abortSignal?: AbortSignal;
  nativeErrorMessage?: string;
};

type UnderstandVideoByFramesDeps = {
  runCommand?: CommandRunner;
  understandFrame?: FrameUnderstandingFn;
  mkdtemp?: typeof fs.mkdtemp;
  rm?: typeof fs.rm;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function truncateInlineText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function parseTimestampToSeconds(value: string | undefined): number | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return undefined;
  const parts = normalized.split(":").map((item) => Number.parseInt(item, 10));
  if (parts.length < 2 || parts.length > 3 || parts.some((item) => !Number.isFinite(item) || item < 0)) {
    return undefined;
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDurationText(seconds: number | undefined): string | undefined {
  if (!Number.isFinite(seconds) || seconds === undefined || seconds <= 0) {
    return undefined;
  }
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `约 ${rounded} 秒`;
  }
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (secs === 0) {
    return `约 ${minutes} 分钟`;
  }
  return `约 ${minutes} 分 ${secs} 秒`;
}

function dedupeStrings(values: Array<string | undefined>, limit = 12): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function deriveFfprobeCommand(ffmpegCommand: string): string {
  const normalized = ffmpegCommand.trim();
  if (!normalized) return DEFAULT_FFPROBE_COMMAND;
  if (/ffmpeg(?:\.exe)?$/iu.test(normalized)) {
    return normalized.replace(/ffmpeg(?:\.exe)?$/iu, (match) => match.toLowerCase().endsWith(".exe") ? "ffprobe.exe" : "ffprobe");
  }
  return DEFAULT_FFPROBE_COMMAND;
}

function readFfmpegCommand(): string {
  const configured = normalizeOptionalString(process.env.BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND);
  return configured ?? DEFAULT_FFMPEG_COMMAND;
}

async function defaultRunCommand(input: {
  command: string;
  args: string[];
  timeoutMs?: number;
}): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Command timed out after ${input.timeoutMs ?? COMMAND_TIMEOUT_MS}ms: ${input.command}`));
    }, input.timeoutMs ?? COMMAND_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

async function defaultUnderstandFrame(input: {
  filePath: string;
  timestampText: string;
  focusMode: "overview" | "timeline" | "timestamp_query";
  targetTimestamp?: string;
  abortSignal?: AbortSignal;
}): Promise<ImageUnderstandResult> {
  return await understandImageFile({
    filePath: input.filePath,
    abortSignal: input.abortSignal,
    focusMode: input.focusMode === "timestamp_query" ? "detail_query" : "overview",
    includeKeyRegions: input.focusMode !== "timestamp_query",
    prompt: input.focusMode === "timestamp_query"
      ? `这是一个视频在约 ${input.timestampText} 抽取的一帧。用户关心视频时间点 ${input.targetTimestamp ?? input.timestampText} 的画面内容。请准确描述这一帧中的主体、动作、场景、可见文字，并说明如果单帧不足以完全确认。`
      : `这是一个视频在约 ${input.timestampText} 抽取的一帧。请描述这一帧的主要画面、动作线索、场景和可见文字，回答尽量简洁明确。`,
    focusTarget: input.focusMode === "timestamp_query"
      ? `视频在约 ${input.targetTimestamp ?? input.timestampText} 的画面内容`
      : undefined,
  });
}

async function probeVideoDurationSeconds(input: {
  filePath: string;
  runCommand: CommandRunner;
  ffprobeCommand: string;
}): Promise<number | undefined> {
  try {
    const result = await input.runCommand({
      command: input.ffprobeCommand,
      args: [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input.filePath,
      ],
    });
    if (result.exitCode !== 0) {
      return undefined;
    }
    const parsed = Number.parseFloat(result.stdout.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function buildSampleTimestamps(input: {
  durationSec?: number;
  focusMode: "overview" | "timeline" | "timestamp_query";
  targetTimestamp?: string;
  maxTimelineItems: number;
}): number[] {
  const requestedTarget = parseTimestampToSeconds(input.targetTimestamp);
  if (input.focusMode === "timestamp_query") {
    const center = requestedTarget ?? 0;
    return Array.from(new Set([
      Math.max(0, center - 2),
      Math.max(0, center),
      Math.max(0, center + 2),
    ])).sort((a, b) => a - b);
  }

  const frameCount = Math.max(2, Math.min(8, input.maxTimelineItems || DEFAULT_SAMPLE_COUNT));
  if (!Number.isFinite(input.durationSec) || input.durationSec === undefined || input.durationSec <= 1) {
    return Array.from({ length: frameCount }, (_, index) => index * 2);
  }

  const maxSecond = Math.max(0, input.durationSec - 0.2);
  if (frameCount === 1) {
    return [0];
  }
  const timestamps: number[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const ratio = frameCount === 1 ? 0 : index / (frameCount - 1);
    timestamps.push(Number((ratio * maxSecond).toFixed(2)));
  }
  return Array.from(new Set(timestamps));
}

async function extractFrameAtTimestamp(input: {
  filePath: string;
  outputPath: string;
  timestampSec: number;
  runCommand: CommandRunner;
  ffmpegCommand: string;
}): Promise<void> {
  const result = await input.runCommand({
    command: input.ffmpegCommand,
    args: [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(Math.max(0, input.timestampSec)),
      "-i",
      input.filePath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-y",
      input.outputPath,
    ],
  });
  if (result.exitCode !== 0) {
    throw new Error(`ffmpeg frame extraction failed at ${formatTimestamp(input.timestampSec)}: ${result.stderr || result.stdout || `exit=${result.exitCode ?? "null"}`}`);
  }
}

function buildFallbackSummary(samples: VideoFrameSample[]): string {
  if (samples.length === 0) {
    return "已通过抽帧兜底完成视频识别，但没有获得有效帧结果。";
  }
  const highlights = dedupeStrings(samples.map((sample) => sample.result.summary), 3);
  if (highlights.length === 0) {
    return `已通过 ${samples.length} 个抽帧样本完成视频识别。`;
  }
  if (highlights.length === 1) {
    return `基于抽帧识别，视频主要内容为：${highlights[0]}`;
  }
  return `基于 ${samples.length} 个抽帧样本，视频大致内容为：${highlights.join("；")}`;
}

function buildFallbackContent(input: {
  samples: VideoFrameSample[];
  timeline: VideoFrameFallbackTimelineEntry[];
  targetMoment?: VideoFrameFallbackTargetMoment;
  nativeErrorMessage?: string;
}): string {
  const lines: string[] = [
    "已切换到视频抽帧兜底识别。",
  ];
  if (input.nativeErrorMessage) {
    lines.push(`原生视频识别失败原因：${input.nativeErrorMessage}`);
  }
  if (input.samples.length > 0) {
    lines.push(`抽帧总览：${buildFallbackSummary(input.samples)}`);
  }
  if (input.timeline.length > 0) {
    lines.push(`关键时间线：${input.timeline.map((item) => `${item.timestamp} ${truncateInlineText(item.summary, 80)}`).join("；")}`);
  }
  if (input.targetMoment?.summary) {
    lines.push(`目标时间点：${input.targetMoment.matchedTimestamp ?? input.targetMoment.requestedTimestamp ?? "未知"} ${truncateInlineText(input.targetMoment.summary, 120)}`);
  }
  return lines.join("\n\n");
}

export async function understandVideoFileByFrameSampling(
  input: UnderstandVideoByFramesInput,
  deps: UnderstandVideoByFramesDeps = {},
): Promise<VideoFrameFallbackResult> {
  const imageConfig = readImageUnderstandConfig();
  if (!imageConfig.enabled || !imageConfig.apiKey) {
    throw new Error("Video frame fallback requires image understanding to be enabled and configured.");
  }

  const runCommand = deps.runCommand ?? defaultRunCommand;
  const understandFrame = deps.understandFrame ?? defaultUnderstandFrame;
  const ffmpegCommand = readFfmpegCommand();
  const ffprobeCommand = deriveFfprobeCommand(ffmpegCommand);
  const durationSec = await probeVideoDurationSeconds({
    filePath: input.filePath,
    runCommand,
    ffprobeCommand,
  });
  const timestamps = buildSampleTimestamps({
    durationSec,
    focusMode: input.focusMode,
    targetTimestamp: input.targetTimestamp,
    maxTimelineItems: input.maxTimelineItems,
  });
  const mkdtemp = deps.mkdtemp ?? fs.mkdtemp;
  const rm = deps.rm ?? fs.rm;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "belldandy-video-fallback-"));
  const samples: VideoFrameSample[] = [];

  try {
    for (const timestampSec of timestamps) {
      const timestampText = formatTimestamp(timestampSec);
      const imagePath = path.join(
        tempDir,
        `frame_${String(Math.floor(timestampSec * 1000)).padStart(8, "0")}.jpg`,
      );
      await extractFrameAtTimestamp({
        filePath: input.filePath,
        outputPath: imagePath,
        timestampSec,
        runCommand,
        ffmpegCommand,
      });
      const result = await understandFrame({
        filePath: imagePath,
        timestampText,
        focusMode: input.focusMode,
        targetTimestamp: input.targetTimestamp,
        abortSignal: input.abortSignal,
      });
      samples.push({
        timestampSec,
        timestampText,
        imagePath,
        result,
      });
    }

    if (samples.length === 0) {
      throw new Error("Video frame fallback did not produce any frame samples.");
    }

    const tags = dedupeStrings(samples.flatMap((sample) => sample.result.tags), 16);
    const ocrLines = dedupeStrings(samples.map((sample) => sample.result.ocrText), 8);
    const timeline = input.includeTimeline
      ? samples.slice(0, Math.max(1, Math.min(input.maxTimelineItems, samples.length))).map<VideoFrameFallbackTimelineEntry>((sample) => ({
        timestamp: sample.timestampText,
        summary: sample.result.summary,
        ocrText: sample.result.ocrText,
      }))
      : [];
    const targetMoment = input.focusMode === "timestamp_query"
      ? buildTargetMomentFromSamples(samples, input.targetTimestamp)
      : undefined;

    return {
      summary: buildFallbackSummary(samples),
      tags,
      ocrText: ocrLines.length > 0 ? ocrLines.join("\n") : undefined,
      content: buildFallbackContent({
        samples,
        timeline,
        targetMoment,
        nativeErrorMessage: input.nativeErrorMessage,
      }),
      durationText: formatDurationText(durationSec),
      timeline,
      targetMoment,
      provider: "frame_fallback",
      model: imageConfig.model,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildTargetMomentFromSamples(
  samples: VideoFrameSample[],
  requestedTimestamp?: string,
): VideoFrameFallbackTargetMoment | undefined {
  if (samples.length === 0 && !requestedTimestamp) {
    return undefined;
  }
  const requestedSeconds = parseTimestampToSeconds(requestedTimestamp);
  const matched = requestedSeconds === undefined
    ? samples[0]
    : samples.reduce((best, current) => {
      if (!best) return current;
      return Math.abs(current.timestampSec - requestedSeconds) < Math.abs(best.timestampSec - requestedSeconds)
        ? current
        : best;
    }, samples[0]);
  if (!matched) {
    return undefined;
  }
  return {
    requestedTimestamp,
    matchedTimestamp: matched.timestampText,
    summary: matched.result.targetDetail?.summary ?? matched.result.summary,
    ocrText: matched.result.targetDetail?.ocrText ?? matched.result.ocrText,
    note: "该回答基于抽帧兜底的近似时间点识别，可能与精确秒级画面存在轻微偏差。",
  };
}
