import crypto from "node:crypto";

import type { Tool, ToolCallResult } from "../../types.js";
import { buildFailureToolCallResult } from "../../failure-kind.js";
import {
  clearMediaUnderstandingCache,
  type MediaUnderstandingCacheKind,
} from "./understanding-cache.js";

type MultimediaCacheClearScope = "all" | "audio" | "image" | "video";

function resolveCacheKinds(scope: MultimediaCacheClearScope): MediaUnderstandingCacheKind[] {
  switch (scope) {
    case "audio":
      return ["audio-transcription"];
    case "image":
      return ["image-understanding"];
    case "video":
      return ["video-understanding"];
    default:
      return ["audio-transcription", "image-understanding", "video-understanding"];
  }
}

function normalizeScope(value: unknown): MultimediaCacheClearScope {
  if (value === "audio" || value === "image" || value === "video") return value;
  return "all";
}

export const multimediaCacheClearTool: Tool = {
  definition: {
    name: "multimedia_cache_clear",
    description: "Clear persisted multimedia understanding cache files under the current stateDir.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["all", "audio", "image", "video"],
          description: "Which multimedia cache to clear. Defaults to all.",
        },
      },
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const name = "multimedia_cache_clear";

    if (!context.stateDir?.trim()) {
      return buildFailureToolCallResult({
        id,
        name,
        start,
        error: "当前运行时没有可用的 stateDir，无法清理多模态缓存。",
        failureKind: "environment_error",
      });
    }

    try {
      const scope = normalizeScope(args.scope);
      const cleared = await clearMediaUnderstandingCache({
        stateDir: context.stateDir,
        kinds: resolveCacheKinds(scope),
      });
      context.logger?.info(
        `multimedia_cache_clear completed (scope=${scope}, clearedKinds=${cleared.clearedKinds.join(",") || "none"})`,
      );
      return {
        id,
        name,
        success: true,
        output: JSON.stringify({
          scope,
          rootDir: cleared.rootDir,
          clearedKinds: cleared.clearedKinds,
        }),
        durationMs: Date.now() - start,
        metadata: {
          scope,
          stateDir: context.stateDir,
        },
      };
    } catch (error) {
      return buildFailureToolCallResult({
        id,
        name,
        start,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
