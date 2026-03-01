import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { normalizeRouterConfig } from "./engine.js";
import type { ChannelRouterConfig, ChannelRouterLogger } from "./types.js";

function expandHomeDir(filePath: string): string {
  if (!filePath.startsWith("~")) return filePath;
  return path.join(os.homedir(), filePath.slice(1));
}

export function loadChannelRouterConfig(
  configPath: string | undefined,
  logger?: ChannelRouterLogger,
): ChannelRouterConfig {
  const fallback: ChannelRouterConfig = { version: 1, rules: [] };
  if (!configPath || !configPath.trim()) {
    logger?.info?.("no channel router config path provided, use empty rules");
    return fallback;
  }

  const resolvedPath = path.resolve(expandHomeDir(configPath.trim()));
  try {
    const raw = fs.readFileSync(resolvedPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const config = normalizeRouterConfig(parsed);
    logger?.info?.("loaded channel router config", {
      path: resolvedPath,
      rules: config.rules.length,
    });
    return config;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      logger?.warn?.("channel router config file not found, use empty rules", { path: resolvedPath });
      return fallback;
    }

    logger?.warn?.("failed to load channel router config, use empty rules", {
      path: resolvedPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

