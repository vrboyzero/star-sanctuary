/**
 * Belldandy Logger - 核心类
 *
 * 支持多 Transport、级别过滤、子 Logger（带模块前缀）。
 */

import type { LogEntry, LogLevel, LogTransport, LoggerOptions } from "./types.js";
import { LOG_LEVEL_WEIGHT } from "./types.js";
import { createConsoleTransport } from "./console-transport.js";
import { createFileTransport, parseSizeToBytes } from "./file-transport.js";
import path from "node:path";
import os from "node:os";
import { resolveDefaultStateDir } from "@belldandy/protocol";

const DEFAULT_LOG_DIR = path.join(resolveDefaultStateDir(), "logs");
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_RETENTION_DAYS = 7;

function formatForConsole(entry: LogEntry): string {
  const ts = entry.timestamp.toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const modulePart = entry.module ? ` [${entry.module}]` : "";
  let msg = entry.message;
  if (entry.data !== undefined) {
    try {
      const dataStr = typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
      msg += " " + dataStr;
    } catch {
      msg += " [object]";
    }
  }
  return `[${ts}] [${level}]${modulePart} ${msg}`;
}

function formatForFile(entry: LogEntry): string {
  return formatForConsole(entry);
}

export interface BelldandyLogger {
  debug(module: string, message: string, data?: unknown): void;
  info(module: string, message: string, data?: unknown): void;
  warn(module: string, message: string, data?: unknown): void;
  error(module: string, message: string, data?: unknown): void;
  /** 创建子 Logger，所有日志会带上模块前缀 */
  child(module: string): ChildLogger;
  /** 关闭所有 Transport（如文件句柄） */
  close(): void | Promise<void>;
}

export interface ChildLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(opts: LoggerOptions & { stateDir?: string }): BelldandyLogger {
  const level = (opts.level ?? "debug") as LogLevel;
  const levelWeight = LOG_LEVEL_WEIGHT[level];

  const logDir = opts.dir ?? (opts.stateDir ? path.join(opts.stateDir, "logs") : DEFAULT_LOG_DIR);
  const maxFileSize = opts.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const maxRetentionDays = opts.maxRetentionDays ?? DEFAULT_MAX_RETENTION_DAYS;
  const enableConsole = opts.enableConsole !== false;
  const enableFile = opts.enableFile !== false;
  const defaultModule = opts.defaultModule ?? "";

  const transports: LogTransport[] = [];
  if (enableConsole) transports.push(createConsoleTransport());
  if (enableFile) transports.push(createFileTransport({ dir: logDir, maxFileSize, maxRetentionDays }));

  function shouldLog(entryLevel: LogLevel): boolean {
    return LOG_LEVEL_WEIGHT[entryLevel] >= levelWeight;
  }

  function log(entryLevel: LogLevel, module: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level: entryLevel,
      module: module || defaultModule,
      message,
      data,
    };
    if (!shouldLog(entryLevel)) return;
    const formatted = formatForFile(entry);
    for (const t of transports) {
      t.write(entry, formatted);
    }
  }

  const logger: BelldandyLogger = {
    debug(m, msg, data) {
      log("debug", m, msg, data);
    },
    info(m, msg, data) {
      log("info", m, msg, data);
    },
    warn(m, msg, data) {
      log("warn", m, msg, data);
    },
    error(m, msg, data) {
      log("error", m, msg, data);
    },
    child(module: string): ChildLogger {
      return {
        debug(msg, data) {
          logger.debug(module, msg, data);
        },
        info(msg, data) {
          logger.info(module, msg, data);
        },
        warn(msg, data) {
          logger.warn(module, msg, data);
        },
        error(msg, data) {
          logger.error(module, msg, data);
        },
      };
    },
    close() {
      for (const t of transports) {
        t.close?.();
      }
    },
  };

  return logger;
}


function expandHome(filepath: string): string {
  if (filepath.startsWith("~")) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

/** 从环境变量创建 Logger（用于 Gateway 启动） */
export function createLoggerFromEnv(stateDir: string): BelldandyLogger {
  const level = process.env.BELLDANDY_LOG_LEVEL ?? "debug";
  let logDir = process.env.BELLDANDY_LOG_DIR ?? path.join(stateDir, "logs");
  logDir = expandHome(logDir);

  const maxSizeStr = process.env.BELLDANDY_LOG_MAX_SIZE ?? "10MB";
  const maxRetentionDays = Number(process.env.BELLDANDY_LOG_RETENTION_DAYS ?? "7") || 7;
  const enableConsole = (process.env.BELLDANDY_LOG_CONSOLE ?? "true") !== "false";
  const enableFile = (process.env.BELLDANDY_LOG_FILE ?? "true") !== "false";

  return createLogger({
    level: level as LogLevel,
    dir: logDir,
    maxFileSize: parseSizeToBytes(maxSizeStr),
    maxRetentionDays,
    enableConsole,
    enableFile,
    stateDir,
  });
}
