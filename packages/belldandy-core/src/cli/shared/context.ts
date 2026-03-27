/**
 * CLIContext — shared context for all CLI commands.
 * Provides stateDir resolution, output mode, and logging helpers.
 */
import path from "node:path";
import pc from "picocolors";
import { resolveStateDir, loadProjectEnvFiles } from "./env-loader.js";

export interface CLIContext {
  stateDir: string;
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
  // 加载 .env / .env.local，确保 BELLDANDY_STATE_DIR 等环境变量在 CLI 进程中生效。
  // 与 gateway.ts 的加载逻辑保持一致，避免服务器与 CLI 读取不同的 stateDir。
  loadProjectEnvFiles({
    envPath: path.join(process.cwd(), ".env"),
    envLocalPath: path.join(process.cwd(), ".env.local"),
  });

  const stateDir = args.stateDir ?? resolveStateDir();
  const json = args.json ?? false;

  return {
    stateDir,
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
