import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { TranscribeResult } from "@belldandy/skills";

const AUDIO_TRANSCRIPTION_CACHE_VERSION = 1;

export type CachedAudioTranscriptionRecord = {
  version: number;
  fingerprint: string;
  mime?: string;
  createdAt: string;
  result: TranscribeResult;
};

function getAudioTranscriptionCacheDir(stateDir: string): string {
  return path.join(stateDir, "storage", "attachment-understanding-cache", "audio-transcription");
}

function getAudioTranscriptionCachePath(stateDir: string, fingerprint: string): string {
  return path.join(getAudioTranscriptionCacheDir(stateDir), `${fingerprint}.json`);
}

export function createAttachmentFingerprint(input: {
  buffer: Buffer;
  mime?: string;
}): string {
  const hash = crypto.createHash("sha256");
  hash.update(input.mime?.trim().toLowerCase() ?? "");
  hash.update("\n");
  hash.update(input.buffer);
  return hash.digest("hex");
}

export async function readCachedAudioTranscription(input: {
  stateDir: string;
  fingerprint: string;
}): Promise<CachedAudioTranscriptionRecord | undefined> {
  try {
    const raw = await fs.readFile(getAudioTranscriptionCachePath(input.stateDir, input.fingerprint), "utf-8");
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
  const dir = getAudioTranscriptionCacheDir(input.stateDir);
  await fs.mkdir(dir, { recursive: true });
  const record: CachedAudioTranscriptionRecord = {
    version: AUDIO_TRANSCRIPTION_CACHE_VERSION,
    fingerprint: input.fingerprint,
    mime: input.mime,
    createdAt: new Date().toISOString(),
    result: input.result,
  };
  await fs.writeFile(
    getAudioTranscriptionCachePath(input.stateDir, input.fingerprint),
    JSON.stringify(record, null, 2),
    "utf-8",
  );
}
