import fs from "node:fs/promises";

import OpenAI from "openai";

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_SDK_TIMEOUT_MS = 2_147_483_647;

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function parseTimeoutMs(value: string | undefined, fallback = DEFAULT_TIMEOUT_MS): number {
  if ((value ?? "").trim() === "0") {
    return 0;
  }
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function stripMarkdownCodeFences(value: string): string {
  return value.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
}

export function createOpenAIClient(input: {
  apiKey: string;
  baseURL: string;
  timeoutMs: number;
}): OpenAI {
  return new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    timeout: input.timeoutMs > 0 ? input.timeoutMs : MAX_SDK_TIMEOUT_MS,
  });
}

export function guessImageMimeFromFilePath(filePath: string): string {
  const lower = filePath.trim().toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

export function guessVideoMimeFromFilePath(filePath: string): string {
  const lower = filePath.trim().toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  return "application/octet-stream";
}

export function buildVersionedApiUrl(baseUrl: string, endpoint: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");
  const base = /\/v\d+$/u.test(trimmed) ? trimmed : `${trimmed}/v1`;
  return `${base}${endpoint}`;
}

export async function uploadFileToOpenAICompatible(input: {
  filePath: string;
  apiKey: string;
  baseURL: string;
  purpose: string;
  maxBytes: number;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const stat = await fs.stat(input.filePath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${input.filePath}`);
  }
  if (stat.size > input.maxBytes) {
    throw new Error(`File too large (${stat.size} bytes > ${input.maxBytes} bytes).`);
  }

  const fileName = input.filePath.split(/[\\/]/u).pop() ?? "upload.bin";
  const buffer = await fs.readFile(input.filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer]), fileName);
  form.append("purpose", input.purpose);

  const response = await fetch(buildVersionedApiUrl(input.baseURL, "/files"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: form,
    signal: input.abortSignal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upload failed: ${response.status} ${text}`.trim());
  }

  const payload = await response.json() as { id?: unknown };
  const fileId = normalizeOptionalString(payload?.id);
  if (!fileId) {
    throw new Error("Upload response did not include a file id.");
  }
  return fileId;
}
