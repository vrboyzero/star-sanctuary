import {
  readImageUnderstandConfig,
  understandImageFile,
  type ImageUnderstandResult,
} from "./image-understand.js";
import { guessImageMimeFromFilePath } from "./understand-shared.js";
import {
  createMediaFingerprintFromFile,
  readCachedImageUnderstanding,
  writeCachedImageUnderstanding,
} from "./understanding-cache.js";

export type CapturedImageUnderstandingResult =
  | {
    status: "completed";
    result: ImageUnderstandResult;
    preview: string;
  }
  | {
    status: "disabled";
  }
  | {
    status: "failed";
    error: string;
  };

function readAutoUnderstandEnabled(envName: string): boolean {
  const raw = process.env[envName];
  if (typeof raw !== "string" || !raw.trim()) {
    return true;
  }
  return raw.trim().toLowerCase() !== "false";
}

function truncateInlineText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

export function buildCapturedImageUnderstandingPreview(result: ImageUnderstandResult): string {
  const lines = [`图片识别摘要: ${truncateInlineText(result.summary, 240)}`];
  if (result.keyRegions.length > 0) {
    lines.push(`图片重点区域: ${result.keyRegions.slice(0, 3).map((item) => `${truncateInlineText(item.label, 24)} ${truncateInlineText(item.summary, 48)}`).join("；")}`);
  }
  if (result.ocrText) {
    lines.push(`图片可见文字: ${truncateInlineText(result.ocrText, 400)}`);
  }
  return lines.join("\n");
}

export async function understandCapturedImageArtifact(input: {
  filePath: string;
  mimeType?: string;
  stateDir?: string;
  abortSignal?: AbortSignal;
  autoUnderstandEnvName: string;
}): Promise<CapturedImageUnderstandingResult> {
  if (!readAutoUnderstandEnabled(input.autoUnderstandEnvName)) {
    return { status: "disabled" };
  }

  const imageUnderstandConfig = readImageUnderstandConfig();
  if (!imageUnderstandConfig.enabled) {
    return { status: "disabled" };
  }

  try {
    const stateDir = typeof input.stateDir === "string" && input.stateDir.trim()
      ? input.stateDir
      : undefined;
    const mimeType = input.mimeType || guessImageMimeFromFilePath(input.filePath);
    const fingerprint = stateDir
      ? await createMediaFingerprintFromFile({
        filePath: input.filePath,
        mime: mimeType,
      })
      : undefined;
    if (stateDir && fingerprint) {
      const cached = await readCachedImageUnderstanding({
        stateDir,
        fingerprint,
      });
      if (cached?.result) {
        return {
          status: "completed",
          preview: buildCapturedImageUnderstandingPreview(cached.result),
          result: cached.result,
        };
      }
    }

    const result = await understandImageFile({
      filePath: input.filePath,
      mimeType,
      abortSignal: input.abortSignal,
      focusMode: "overview",
      includeKeyRegions: true,
    });
    if (stateDir && fingerprint) {
      await writeCachedImageUnderstanding({
        stateDir,
        fingerprint,
        mime: mimeType,
        result,
      });
    }
    return {
      status: "completed",
      preview: buildCapturedImageUnderstandingPreview(result),
      result,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
