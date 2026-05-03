import fs from "node:fs";
import path from "node:path";

import type { BelldandyLogger } from "../logger/index.js";
import { isConfigFileRestartSuppressed } from "../config-restart-guard.js";

export function startGatewayConfigWatcher(input: {
  envDir: string;
  envPath: string;
  envLocalPath: string;
  logger: Pick<BelldandyLogger, "info">;
  onRestartRequired: (fileName: string) => void;
  debounceMs?: number;
}): void {
  const watchFiles = new Set([
    path.basename(input.envPath),
    path.basename(input.envLocalPath),
  ]);
  const debounceMs = input.debounceMs ?? 1500;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerRestart = (fileName: string) => {
    if (isConfigFileRestartSuppressed(fileName)) {
      return;
    }
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      input.onRestartRequired(fileName);
    }, debounceMs);
  };

  try {
    fs.watch(input.envDir, (eventType: string, fileName: string | Buffer | null) => {
      const normalizedFileName = typeof fileName === "string" ? fileName : fileName?.toString();
      if (normalizedFileName && watchFiles.has(normalizedFileName) && (eventType === "rename" || eventType === "change")) {
        triggerRestart(normalizedFileName);
      }
    });
    input.logger.info("config-watcher", "监听 .env 变更");
    input.logger.info("config-watcher", "监听 .env.local 变更");
  } catch {
    for (const name of watchFiles) {
      const envFile = path.join(input.envDir, name);
      try {
        if (fs.existsSync(envFile)) {
          fs.watch(envFile, (eventType) => {
            if (eventType === "change") triggerRestart(name);
          });
        }
      } catch {
        // ignore fallback errors
      }
    }
  }
}
