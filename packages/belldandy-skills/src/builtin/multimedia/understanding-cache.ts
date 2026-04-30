import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ImageUnderstandResult } from "./image-understand.js";
import type { TranscribeResult } from "./stt-transcribe.js";
import type { VideoUnderstandResult } from "./video-understand.js";

const AUDIO_TRANSCRIPTION_CACHE_VERSION = 1;
const IMAGE_UNDERSTANDING_CACHE_VERSION = 1;
const VIDEO_UNDERSTANDING_CACHE_VERSION = 1;

export type CachedAudioTranscriptionRecord = {
  version: number;
  fingerprint: string;
  mime?: string;
  createdAt: string;
  result: TranscribeResult;
};

export type CachedImageUnderstandingRecord = {
  version: number;
  fingerprint: string;
  mime?: string;
  createdAt: string;
  result: ImageUnderstandResult;
};

export type CachedVideoUnderstandingRecord = {
  version: number;
  fingerprint: string;
  mime?: string;
  createdAt: string;
  result: VideoUnderstandResult;
};

function getMediaUnderstandingCacheDir(
  stateDir: string,
  kind: "audio-transcription" | "image-understanding" | "video-understanding",
): string {
  return path.join(stateDir, "storage", "attachment-understanding-cache", kind);
}

function getMediaUnderstandingCachePath(
  stateDir: string,
  kind: "audio-transcription" | "image-understanding" | "video-understanding",
  fingerprint: string,
): string {
  return path.join(getMediaUnderstandingCacheDir(stateDir, kind), `${fingerprint}.json`);
}

export function createMediaFingerprint(input: {
  buffer: Buffer;
  mime?: string;
}): string {
  const hash = crypto.createHash("sha256");
  hash.update(input.mime?.trim().toLowerCase() ?? "");
  hash.update("\n");
  hash.update(input.buffer);
  return hash.digest("hex");
}

export async function createMediaFingerprintFromFile(input: {
  filePath: string;
  mime?: string;
}): Promise<string> {
  const buffer = await fs.readFile(input.filePath);
  return createMediaFingerprint({
    buffer,
    mime: input.mime,
  });
}

export async function readCachedAudioTranscription(input: {
  stateDir: string;
  fingerprint: string;
}): Promise<CachedAudioTranscriptionRecord | undefined> {
  try {
    const raw = await fs.readFile(
      getMediaUnderstandingCachePath(input.stateDir, "audio-transcription", input.fingerprint),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as CachedAudioTranscriptionRecord;
    if (parsed?.version !== AUDIO_TRANSCRIPTION_CACHE_VERSION) return undefined;
    if (parsed?.fingerprint !== input.fingerprint) return undefined;
    if (!parsed.result || typeof parsed.result.text !== "string") return undefined;
    return parsed;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeCachedAudioTranscription(input: {
  stateDir: string;
  fingerprint: string;
  mime?: string;
  result: TranscribeResult;
}): Promise<void> {
  const dir = getMediaUnderstandingCacheDir(input.stateDir, "audio-transcription");
  await fs.mkdir(dir, { recursive: true });
  const record: CachedAudioTranscriptionRecord = {
    version: AUDIO_TRANSCRIPTION_CACHE_VERSION,
    fingerprint: input.fingerprint,
    mime: input.mime,
    createdAt: new Date().toISOString(),
    result: input.result,
  };
  await fs.writeFile(
    getMediaUnderstandingCachePath(input.stateDir, "audio-transcription", input.fingerprint),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

export async function readCachedImageUnderstanding(input: {
  stateDir: string;
  fingerprint: string;
}): Promise<CachedImageUnderstandingRecord | undefined> {
  try {
    const raw = await fs.readFile(
      getMediaUnderstandingCachePath(input.stateDir, "image-understanding", input.fingerprint),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as CachedImageUnderstandingRecord;
    if (parsed?.version !== IMAGE_UNDERSTANDING_CACHE_VERSION) return undefined;
    if (parsed?.fingerprint !== input.fingerprint) return undefined;
    if (!parsed.result || typeof parsed.result.summary !== "string") return undefined;
    return parsed;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeCachedImageUnderstanding(input: {
  stateDir: string;
  fingerprint: string;
  mime?: string;
  result: ImageUnderstandResult;
}): Promise<void> {
  const dir = getMediaUnderstandingCacheDir(input.stateDir, "image-understanding");
  await fs.mkdir(dir, { recursive: true });
  const record: CachedImageUnderstandingRecord = {
    version: IMAGE_UNDERSTANDING_CACHE_VERSION,
    fingerprint: input.fingerprint,
    mime: input.mime,
    createdAt: new Date().toISOString(),
    result: input.result,
  };
  await fs.writeFile(
    getMediaUnderstandingCachePath(input.stateDir, "image-understanding", input.fingerprint),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}

export async function readCachedVideoUnderstanding(input: {
  stateDir: string;
  fingerprint: string;
}): Promise<CachedVideoUnderstandingRecord | undefined> {
  try {
    const raw = await fs.readFile(
      getMediaUnderstandingCachePath(input.stateDir, "video-understanding", input.fingerprint),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as CachedVideoUnderstandingRecord;
    if (parsed?.version !== VIDEO_UNDERSTANDING_CACHE_VERSION) return undefined;
    if (parsed?.fingerprint !== input.fingerprint) return undefined;
    if (!parsed.result || typeof parsed.result.summary !== "string") return undefined;
    return parsed;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeCachedVideoUnderstanding(input: {
  stateDir: string;
  fingerprint: string;
  mime?: string;
  result: VideoUnderstandResult;
}): Promise<void> {
  const dir = getMediaUnderstandingCacheDir(input.stateDir, "video-understanding");
  await fs.mkdir(dir, { recursive: true });
  const record: CachedVideoUnderstandingRecord = {
    version: VIDEO_UNDERSTANDING_CACHE_VERSION,
    fingerprint: input.fingerprint,
    mime: input.mime,
    createdAt: new Date().toISOString(),
    result: input.result,
  };
  await fs.writeFile(
    getMediaUnderstandingCachePath(input.stateDir, "video-understanding", input.fingerprint),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}
