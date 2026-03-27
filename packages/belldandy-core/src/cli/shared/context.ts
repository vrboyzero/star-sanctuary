/**
 * CLIContext — shared context for all CLI commands.
 * Provides stateDir resolution, output mode, and logging helpers.
 */
import pc from "picocolors";
import { resolveEnvFilePaths, resolvePreferredEnvDirInfo, type EnvDirSource } from "@star-sanctuary/distribution";
import { resolveStateDir, loadProjectEnvFiles } from "./env-loader.js";

export interface CLIContext {
  stateDir: string;
  envDir: string;
  envSource: EnvDirSource;
  json: boolean;
  verbose: boolean;
  log: (msg: string) => void;
  error: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  /** --json → JSON.stringify, otherwise human-friendly */
  output: (data: unknown) => void;
}

export function createCLIContext(args: {
  json?: boolean;
  stateDir?: string;
  verbose?: boolean;
}): CLIContext {
  const envSelection = resolvePreferredEnvDirInfo({
    env: process.env,
    cwd: process.cwd(),
    stateDir: args.stateDir,
  });
  const envDir = envSelection.envDir;

  // 先按统一 envDir 规则加载 .env / .env.local，再解析 stateDir。
  // 这样 CLI 与 gateway.ts 在 legacy root env 和 stateDir env 两种模式下保持一致。
  const envFiles = resolveEnvFilePaths({ envDir });
  loadProjectEnvFiles({
    envPath: envFiles.envPath,
    envLocalPath: envFiles.envLocalPath,
  });

  const stateDir = args.stateDir ?? resolveStateDir();
  const json = args.json ?? false;

  return {
    stateDir,
    envDir,
    envSource: envSelection.source,
    json,
    verbose: args.verbose ?? false,
    log: (msg) => {
      if (!json) console.log(msg);
    },
    error: (msg) => {
      console.error(json ? "" : pc.red(`✗ ${msg}`));
    },
    success: (msg) => {
      if (!json) console.log(pc.green(`✓ ${msg}`));
    },
    warn: (msg) => {
      if (!json) console.log(pc.yellow(`⚠ ${msg}`));
    },
    output: (data) => {
      if (json) {
        console.log(JSON.stringify(data, null, 2));
      } else if (Array.isArray(data)) {
        data.forEach((row) => console.log(row));
      } else {
        console.log(data);
      }
    },
  };
}
