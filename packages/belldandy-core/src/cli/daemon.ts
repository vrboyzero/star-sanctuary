/**
 * Daemon management module for Belldandy Gateway.
 * Provides start/stop/status functionality for background process management.
 */
import { fork, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStateDir } from "./shared/env-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 根据当前文件扩展名判断是开发模式(.ts)还是生产模式(.js)
const EXT = path.extname(__filename);
const GATEWAY_SCRIPT = path.resolve(__dirname, `../bin/gateway${EXT}`);

// 重启信号 exit code（与 system.restart 保持一致）
const RESTART_EXIT_CODE = 100;
const RESTART_DELAY_MS = 500;

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  uptime: number | null; // seconds
  logFile: string;
  pidFile: string;
}

/** Get PID file path */
export function getPidFile(stateDir?: string): string {
  const dir = stateDir ?? resolveStateDir();
  return path.join(dir, "gateway.pid");
}

/** Get log file path */
export function getLogFile(stateDir?: string): string {
  const dir = stateDir ?? resolveStateDir();
  return path.join(dir, "logs", "gateway.log");
}

/** Check if a process with given PID is running */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read PID from file, returns null if file doesn't exist or is invalid */
export function readPid(stateDir?: string): number | null {
  const pidFile = getPidFile(stateDir);
  try {
    const content = fs.readFileSync(pidFile, "utf-8").trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** Write PID to file */
export function writePid(pid: number, stateDir?: string): void {
  const pidFile = getPidFile(stateDir);
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, String(pid), "utf-8");
}

/** Remove PID file */
export function removePid(stateDir?: string): void {
  const pidFile = getPidFile(stateDir);
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // Ignore if file doesn't exist
  }
}

/** Get daemon status */
export function getDaemonStatus(stateDir?: string): DaemonStatus {
  const pidFile = getPidFile(stateDir);
  const logFile = getLogFile(stateDir);
  const pid = readPid(stateDir);

  if (pid === null) {
    return { running: false, pid: null, uptime: null, logFile, pidFile };
  }

  const running = isProcessRunning(pid);
  if (!running) {
    // Stale PID file - process is not running
    return { running: false, pid, uptime: null, logFile, pidFile };
  }

  // Try to get uptime from PID file mtime
  let uptime: number | null = null;
  try {
    const stat = fs.statSync(pidFile);
    uptime = Math.floor((Date.now() - stat.mtimeMs) / 1000);
  } catch {
    // Ignore
  }

  return { running: true, pid, uptime, logFile, pidFile };
}

/** Start gateway in daemon mode (detached background process) */
export async function startDaemon(stateDir?: string): Promise<{ success: boolean; pid?: number; error?: string }> {
  const status = getDaemonStatus(stateDir);

  // Check if already running
  if (status.running && status.pid) {
    return { success: false, error: `Gateway is already running (PID ${status.pid})` };
  }

  // Clean up stale PID file if exists
  if (status.pid && !status.running) {
    removePid(stateDir);
  }

  // Ensure log directory exists
  const logFile = getLogFile(stateDir);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  // Open log file for appending
  const logFd = fs.openSync(logFile, "a");

  try {
    const child = fork(GATEWAY_SCRIPT, [], {
      detached: true,
      stdio: ["ignore", logFd, logFd, "ipc"],
      execArgv: EXT === ".ts" ? ["--import", "tsx"] : [],
      env: { ...process.env },
    });

    if (!child.pid) {
      fs.closeSync(logFd);
      return { success: false, error: "Failed to start gateway process" };
    }

    // Write PID file
    writePid(child.pid, stateDir);

    // Detach from parent - allow parent to exit
    child.unref();

    // Close log fd in parent process
    fs.closeSync(logFd);

    return { success: true, pid: child.pid };
  } catch (err) {
    fs.closeSync(logFd);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Stop daemon process */
export async function stopDaemon(stateDir?: string, timeout = 10000): Promise<{ success: boolean; error?: string }> {
  const status = getDaemonStatus(stateDir);

  if (!status.running || !status.pid) {
    // Clean up stale PID file if exists
    if (status.pid) {
      removePid(stateDir);
    }
    return { success: false, error: "Gateway is not running" };
  }

  const pid = status.pid;

  try {
    // Send SIGTERM for graceful shutdown
    process.kill(pid, "SIGTERM");

    // Wait for process to exit
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (!isProcessRunning(pid)) {
        removePid(stateDir);
        return { success: true };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Process didn't exit in time, try SIGKILL
    try {
      process.kill(pid, "SIGKILL");
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      // Process may have exited
    }

    if (!isProcessRunning(pid)) {
      removePid(stateDir);
      return { success: true };
    }

    return { success: false, error: `Failed to stop process (PID ${pid}) within timeout` };
  } catch (err) {
    // ESRCH means process doesn't exist - that's fine
    if ((err as NodeJS.ErrnoException).code === "ESRCH") {
      removePid(stateDir);
      return { success: true };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Start gateway in foreground with supervisor (auto-restart on exit code 100).
 * This is the existing behavior of `bdd start`.
 */
export function startForeground(): void {
  function launchGateway(): void {
    console.log(`[Launcher] Starting Gateway...`);

    const child = fork(GATEWAY_SCRIPT, [], {
      stdio: "inherit",
      execArgv: EXT === ".ts" ? ["--import", "tsx"] : [],
    });

    child.on("exit", (code, signal) => {
      if (code === RESTART_EXIT_CODE) {
        console.log(`[Launcher] Gateway requested restart, restarting in ${RESTART_DELAY_MS}ms...`);
        setTimeout(() => launchGateway(), RESTART_DELAY_MS);
      } else {
        const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
        console.log(`[Launcher] Gateway exited (${reason}).`);
        process.exit(code ?? 1);
      }
    });

    const forwardSignal = (sig: NodeJS.Signals) => {
      child.kill(sig);
    };
    process.on("SIGINT", forwardSignal);
    process.on("SIGTERM", forwardSignal);
  }

  launchGateway();
}

/** Format uptime in human-readable format */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}
