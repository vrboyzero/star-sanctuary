import type { Tool, ToolCallResult } from "../../types.js";
import OpenAI from "openai";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createLinkedAbortController } from "../../abort-utils.js";

type ImageOutputFormat = "png" | "jpeg" | "webp";

const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_SDK_TIMEOUT_MS = 2_147_483_647;
const REVEAL_PREFIX = "#generated-image-reveal:";

function readImageConfig() {
  return {
    enabled: (process.env.BELLDANDY_IMAGE_ENABLED ?? "true").trim().toLowerCase() !== "false",
    provider: (process.env.BELLDANDY_IMAGE_PROVIDER ?? "openai").trim().toLowerCase(),
    apiKey: process.env.BELLDANDY_IMAGE_OPENAI_API_KEY?.trim() ?? "",
    baseURL: process.env.BELLDANDY_IMAGE_OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.BELLDANDY_IMAGE_MODEL?.trim() || DEFAULT_MODEL,
    outputFormat: normalizeOutputFormat(process.env.BELLDANDY_IMAGE_OUTPUT_FORMAT),
    timeoutMs: parseTimeoutMs(process.env.BELLDANDY_IMAGE_TIMEOUT_MS),
  };
}

function normalizeOutputFormat(value: string | undefined): ImageOutputFormat {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "jpeg" || normalized === "webp") return normalized;
  return "png";
}

function parseTimeoutMs(value: string | undefined): number {
  if ((value ?? "").trim() === "0") {
    return 0;
  }
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function buildTimestamp(): string {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function buildOutput(input: {
  webPath: string;
  relativePath: string;
  model: string;
}): string {
  const safeWebPath = escapeHtml(input.webPath);
  const safeRelativePath = escapeHtml(input.relativePath);
  const safeRevealHref = escapeHtml(`${REVEAL_PREFIX}${input.webPath}`);
  const safeModel = escapeHtml(input.model);
  return [
    `<div class="generated-image-result">`,
    `  <img src="${safeWebPath}" alt="Generated Image">`,
    `  <div class="generated-image-path">保存位置：<a href="${safeRevealHref}" title="打开保存目录">${safeRelativePath}</a></div>`,
    `  <div class="generated-image-meta">模型：${safeModel}</div>`,
    `</div>`,
  ].join("\n");
}

function getGeneratedImagesDir(context: { stateDir?: string; workspaceRoot: string }): string {
  const baseDir = context.stateDir?.trim() || context.workspaceRoot;
  return path.join(baseDir, "generated", "images");
}

async function readGeneratedImageBuffer(item: Record<string, unknown>, abortSignal?: AbortSignal): Promise<Buffer> {
  const b64Json = typeof item.b64_json === "string" ? item.b64_json : "";
  if (b64Json) {
    return Buffer.from(b64Json, "base64");
  }

  const imageUrl = typeof item.url === "string" ? item.url : "";
  if (imageUrl) {
    const response = await fetch(imageUrl, { signal: abortSignal });
    if (!response.ok) {
      throw new Error(`Failed to download generated image (${response.status}).`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error("Image generation response did not include b64_json or url.");
}

export const imageGenerateTool: Tool = {
  definition: {
    name: "image_generate",
    description: "Generate an image using the configured standalone image model.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The description of the image to generate.",
        },
        size: {
          type: "string",
          enum: ["1024x1024", "1536x1024", "1024x1536", "auto"],
          description: "Resolution of the generated image (default: 1024x1024).",
        },
        quality: {
          type: "string",
          enum: ["low", "medium", "high", "auto"],
          description: "Quality of the generated image (default: auto).",
        },
        output_format: {
          type: "string",
          enum: ["png", "jpeg", "webp"],
          description: "Output format written to generated/images (default: png).",
        },
      },
      required: ["prompt"],
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const name = "image_generate";
    const config = readImageConfig();

    if (!config.enabled) {
      return {
        id,
        name,
        success: false,
        output: "",
        error: "BELLDANDY_IMAGE_ENABLED is false.",
        durationMs: Date.now() - start,
      };
    }

    if (config.provider !== "openai") {
      return {
        id,
        name,
        success: false,
        output: "",
        error: `Unsupported BELLDANDY_IMAGE_PROVIDER: ${config.provider}.`,
        durationMs: Date.now() - start,
      };
    }

    if (!config.apiKey) {
      return {
        id,
        name,
        success: false,
        output: "",
        error: "BELLDANDY_IMAGE_OPENAI_API_KEY is required for image generation.",
        durationMs: Date.now() - start,
      };
    }

    try {
      const outputFormat = normalizeOutputFormat(typeof args.output_format === "string" ? args.output_format : config.outputFormat);
      const linkedAbort = createLinkedAbortController({
        signal: context.abortSignal,
        timeoutMs: config.timeoutMs > 0 ? config.timeoutMs : undefined,
        timeoutReason: config.timeoutMs > 0 ? `Image generation timed out after ${config.timeoutMs}ms.` : undefined,
      });
      const openai = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: config.timeoutMs > 0 ? config.timeoutMs : MAX_SDK_TIMEOUT_MS,
      });

      try {
        const response = await (openai.images.generate as any)({
          model: config.model,
          prompt: String(args.prompt ?? ""),
          size: typeof args.size === "string" ? args.size : "1024x1024",
          quality: typeof args.quality === "string" ? args.quality : "auto",
          output_format: outputFormat,
        }, { signal: linkedAbort.controller.signal });

        const firstItem = Array.isArray(response?.data) ? response.data[0] : undefined;
        if (!firstItem || typeof firstItem !== "object") {
          throw new Error("Image generation response was empty.");
        }

        const buffer = await readGeneratedImageBuffer(firstItem as Record<string, unknown>, linkedAbort.controller.signal);
        const generatedImagesDir = getGeneratedImagesDir(context);
        await fs.mkdir(generatedImagesDir, { recursive: true });

        const fileName = `image-${buildTimestamp()}-${crypto.randomUUID().slice(0, 8)}.${outputFormat}`;
        const filePath = path.join(generatedImagesDir, fileName);
        await fs.writeFile(filePath, buffer);

        const relativePath = `generated/images/${fileName}`;
        const webPath = `/generated/images/${fileName}`;

        return {
          id,
          name,
          success: true,
          output: buildOutput({
            webPath,
            relativePath,
            model: config.model,
          }),
          durationMs: Date.now() - start,
          metadata: {
            model: config.model,
            webPath,
            relativePath,
            outputFormat,
          },
        };
      } finally {
        linkedAbort.cleanup();
      }
    } catch (err) {
      return {
        id,
        name,
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  },
};
