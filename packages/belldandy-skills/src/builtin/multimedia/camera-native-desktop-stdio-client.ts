import fs from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

import {
  createLinkedAbortController,
  isAbortError,
  readAbortReason,
  toAbortError,
  throwIfAborted,
} from "../../abort-utils.js";
import {
  CAMERA_NATIVE_DESKTOP_PROTOCOL_ID,
  type CameraNativeDesktopCaptureScreenRequest,
  type CameraNativeDesktopCaptureScreenResponse,
  type CameraNativeDesktopHelperClient,
  type CameraNativeDesktopHelperConfig,
  type CameraNativeDesktopHelperDiagnoseRequest,
  type CameraNativeDesktopHelperDiagnoseResponse,
  type CameraNativeDesktopHelperHelloRequest,
  type CameraNativeDesktopHelperHelloResponse,
  type CameraNativeDesktopListCaptureTargetsRequest,
  type CameraNativeDesktopListCaptureTargetsResponse,
  type CameraNativeDesktopHelperListDevicesRequest,
  type CameraNativeDesktopHelperListDevicesResponse,
  type CameraNativeDesktopHelperShutdownRequest,
  type CameraNativeDesktopHelperShutdownResponse,
  type CameraNativeDesktopHelperCaptureSnapshotRequest,
  type CameraNativeDesktopHelperCaptureSnapshotResponse,
  type CameraNativeDesktopHelperCaptureClipRequest,
  type CameraNativeDesktopHelperCaptureClipResponse,
  type CameraNativeDesktopTransport,
} from "./camera-native-desktop-contract.js";
import {
  createNativeDesktopHelperRequest,
  isNativeDesktopHelperMethod,
  type CameraNativeDesktopHelperMessage,
  type CameraNativeDesktopHelperMethod,
  type CameraNativeDesktopHelperRequestParams,
  type CameraNativeDesktopHelperResponseMessage,
  type CameraNativeDesktopHelperResponseResult,
} from "./camera-native-desktop-protocol.js";
import type { CameraProviderContext } from "./camera-contract.js";
import {
  BELLDANDY_RUNTIME_DIR_ENV,
  STAR_SANCTUARY_RUNTIME_DIR_ENV,
  isLikelyNodeCommand,
  looksLikeNativeDesktopLaunchPath,
  resolveNativeDesktopHelperLaunch,
  type NativeDesktopHelperLaunchResolution,
} from "./camera-native-desktop-launch.js";

const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_IDLE_SHUTDOWN_MS = 2_000;
const MAX_STDERR_LINES = 40;

export const BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV = "BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND";
export const BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV = "BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON";
export const BELLDANDY_CAMERA_NATIVE_HELPER_ENV_JSON_ENV = "BELLDANDY_CAMERA_NATIVE_HELPER_ENV_JSON";
export const BELLDANDY_CAMERA_NATIVE_HELPER_CWD_ENV = "BELLDANDY_CAMERA_NATIVE_HELPER_CWD";
export const BELLDANDY_CAMERA_NATIVE_HELPER_STARTUP_TIMEOUT_MS_ENV =
  "BELLDANDY_CAMERA_NATIVE_HELPER_STARTUP_TIMEOUT_MS";
export const BELLDANDY_CAMERA_NATIVE_HELPER_REQUEST_TIMEOUT_MS_ENV =
  "BELLDANDY_CAMERA_NATIVE_HELPER_REQUEST_TIMEOUT_MS";
export const BELLDANDY_CAMERA_NATIVE_HELPER_IDLE_SHUTDOWN_MS_ENV =
  "BELLDANDY_CAMERA_NATIVE_HELPER_IDLE_SHUTDOWN_MS";

type PendingRequest = {
  method: CameraNativeDesktopHelperMethod;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

type NativeDesktopStdioClientOptions = {
  env?: NodeJS.ProcessEnv;
  spawnProcess?: typeof spawn;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Expected a positive integer but received: ${value}`);
  }
  return Math.trunc(numeric);
}

function parseOptionalNonNegativeInteger(value: string | undefined, label: string): number | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} must be a non-negative integer but received: ${value}`);
  }
  return Math.trunc(numeric);
}

function parseOptionalJsonArray(value: string | undefined, label: string): string[] | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error(`${label} must be a valid JSON array of strings: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a JSON array of strings.`);
  }
  return [...parsed];
}

function parseOptionalJsonRecord(
  value: string | undefined,
  label: string,
): Record<string, string> | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error(`${label} must be a valid JSON object with string values: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object with string values.`);
  }
  const entries = Object.entries(parsed);
  if (entries.some(([, item]) => typeof item !== "string")) {
    throw new Error(`${label} must be a JSON object with string values.`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function formatProcessFailure(input: {
  message: string;
  stderrLines: string[];
}): Error {
  const stderrTail = input.stderrLines.length > 0
    ? `\nHelper stderr:\n${input.stderrLines.join("\n")}`
    : "";
  return new Error(`${input.message}${stderrTail}`);
}

function summarizeHelperLaunch(
  config: CameraNativeDesktopHelperConfig,
  resolution?: NativeDesktopHelperLaunchResolution,
): string {
  const args = (config.args ?? []).map((item) => JSON.stringify(item)).join(", ");
  const parts = [
    `command=${JSON.stringify(config.command)}`,
    `args=[${args}]`,
    `cwd=${JSON.stringify(config.cwd ?? process.cwd())}`,
  ];
  if (resolution?.runtimeDir) {
    parts.push(`runtimeDir=${JSON.stringify(resolution.runtimeDir)}`);
  }
  if (resolution?.resolvedCommandPath && resolution.resolvedCommandPath.resolvedPath !== config.command) {
    parts.push(`resolvedCommand=${JSON.stringify(resolution.resolvedCommandPath.resolvedPath)}`);
  }
  if (resolution?.helperEntry && resolution.helperEntry.resolvedPath !== resolution.helperEntry.value) {
    parts.push(`resolvedHelperEntry=${JSON.stringify(resolution.helperEntry.resolvedPath)}`);
  }
  return parts.join(", ");
}

function buildStartupHint(
  config: CameraNativeDesktopHelperConfig,
  resolution?: NativeDesktopHelperLaunchResolution,
): string {
  const hints = [
    `Launch: ${summarizeHelperLaunch(config, resolution)}`,
    `Check ${BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV}, ${BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV}, and ensure the helper entry has been built.`,
  ];
  if (config.cwd) {
    hints.push(`Configured cwd: ${config.cwd}`);
  }
  if (resolution?.runtimeDir) {
    hints.push(
      `Installed runtime fallback uses ${STAR_SANCTUARY_RUNTIME_DIR_ENV}/${BELLDANDY_RUNTIME_DIR_ENV}=${resolution.runtimeDir}.`,
    );
  }
  return hints.join(" ");
}

function buildHelloRequest(context: CameraProviderContext): CameraNativeDesktopHelperHelloRequest {
  return {
    clientName: "belldandy-gateway",
    conversationId: context.conversationId,
    workspaceRoot: context.workspaceRoot,
  };
}

export function readNativeDesktopHelperConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CameraNativeDesktopHelperConfig | null {
  const command = normalizeString(env[BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]);
  if (!command) {
    return null;
  }
  return {
    protocol: CAMERA_NATIVE_DESKTOP_PROTOCOL_ID,
    transport: "stdio",
    command,
    args: parseOptionalJsonArray(
      env[BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV],
      BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV,
    ),
    env: parseOptionalJsonRecord(
      env[BELLDANDY_CAMERA_NATIVE_HELPER_ENV_JSON_ENV],
      BELLDANDY_CAMERA_NATIVE_HELPER_ENV_JSON_ENV,
    ),
    cwd: normalizeString(env[BELLDANDY_CAMERA_NATIVE_HELPER_CWD_ENV]) || undefined,
    startupTimeoutMs: parseOptionalPositiveInteger(env[BELLDANDY_CAMERA_NATIVE_HELPER_STARTUP_TIMEOUT_MS_ENV]),
    requestTimeoutMs: parseOptionalPositiveInteger(env[BELLDANDY_CAMERA_NATIVE_HELPER_REQUEST_TIMEOUT_MS_ENV]),
    idleShutdownMs: parseOptionalNonNegativeInteger(
      env[BELLDANDY_CAMERA_NATIVE_HELPER_IDLE_SHUTDOWN_MS_ENV],
      BELLDANDY_CAMERA_NATIVE_HELPER_IDLE_SHUTDOWN_MS_ENV,
    ),
  };
}

export class NativeDesktopStdioHelperClient implements CameraNativeDesktopHelperClient {
  private readonly config: CameraNativeDesktopHelperConfig;
  private readonly launchEnv: NodeJS.ProcessEnv;
  private readonly spawnProcess: typeof spawn;
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: readline.Interface | null = null;
  private stderrReader: readline.Interface | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private ensureReadyPromise: Promise<void> | null = null;
  private lastHelloResponse: CameraNativeDesktopHelperHelloResponse | null = null;
  private stderrLines: string[] = [];
  private generation = 0;
  private idleShutdownTimer: NodeJS.Timeout | null = null;

  constructor(
    config: CameraNativeDesktopHelperConfig,
    options: NativeDesktopStdioClientOptions = {},
  ) {
    if (config.transport !== "stdio") {
      throw new Error(`Unsupported native_desktop transport: ${config.transport}`);
    }
    this.config = config;
    this.launchEnv = options.env ?? process.env;
    this.spawnProcess = options.spawnProcess ?? spawn;
  }

  async hello(
    input: CameraNativeDesktopHelperHelloRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperHelloResponse> {
    await this.ensureSpawned(context);
    const response = await this.sendRequest("hello", input, context, {
      timeoutMs: this.config.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
    });
    this.acceptHelloResponse(response);
    return response;
  }

  async diagnose(
    input: CameraNativeDesktopHelperDiagnoseRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperDiagnoseResponse> {
    await this.ensureReady(context);
    return this.sendRequest("diagnose", input, context);
  }

  async listDevices(
    input: CameraNativeDesktopHelperListDevicesRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperListDevicesResponse> {
    await this.ensureReady(context);
    return this.sendRequest("list_devices", input, context);
  }

  async listCaptureTargets(
    input: CameraNativeDesktopListCaptureTargetsRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopListCaptureTargetsResponse> {
    await this.ensureReady(context);
    return this.sendRequest("list_capture_targets", input, context);
  }

  async captureSnapshot(
    input: CameraNativeDesktopHelperCaptureSnapshotRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperCaptureSnapshotResponse> {
    await this.ensureReady(context);
    return this.sendRequest("capture_snapshot", input, context, {
      timeoutMs: input.timeoutMs,
    });
  }

  async captureScreen(
    input: CameraNativeDesktopCaptureScreenRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopCaptureScreenResponse> {
    await this.ensureReady(context);
    return this.sendRequest("capture_screen", input, context, {
      timeoutMs: input.timeoutMs,
    });
  }

  async captureClip(
    input: CameraNativeDesktopHelperCaptureClipRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperCaptureClipResponse> {
    await this.ensureReady(context);
    return this.sendRequest("capture_clip", input, context, {
      timeoutMs: input.timeoutMs,
    });
  }

  async shutdown(
    input: CameraNativeDesktopHelperShutdownRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperShutdownResponse> {
    if (!this.child) {
      return {
        acknowledged: true,
        observedAt: new Date().toISOString(),
      };
    }
    try {
      await this.ensureReady(context);
      return await this.sendRequest("shutdown", input, context, {
        timeoutMs: this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      });
    } finally {
      await this.close();
    }
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.lastHelloResponse = null;
    this.ensureReadyPromise = null;
    this.clearIdleShutdownTimer();
    this.stdoutReader?.close();
    this.stderrReader?.close();
    this.stdoutReader = null;
    this.stderrReader = null;
    this.rejectPendingRequests(new Error("native_desktop helper client closed."));
    if (!child) {
      return;
    }
    if (!child.killed) {
      child.kill();
    }
  }

  private getStartupTimeoutMs(): number {
    return this.config.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  }

  private getRequestTimeoutMs(override?: number): number {
    if (typeof override === "number" && Number.isFinite(override) && override > 0) {
      return Math.trunc(override);
    }
    return this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private getIdleShutdownMs(): number {
    if (typeof this.config.idleShutdownMs === "number" && Number.isFinite(this.config.idleShutdownMs)) {
      return Math.max(0, Math.trunc(this.config.idleShutdownMs));
    }
    return DEFAULT_IDLE_SHUTDOWN_MS;
  }

  private clearIdleShutdownTimer(): void {
    if (this.idleShutdownTimer) {
      clearTimeout(this.idleShutdownTimer);
      this.idleShutdownTimer = null;
    }
  }

  private scheduleIdleShutdown(): void {
    this.clearIdleShutdownTimer();
    const idleShutdownMs = this.getIdleShutdownMs();
    if (idleShutdownMs <= 0 || !this.isChildUsable() || this.pendingRequests.size > 0) {
      return;
    }
    this.idleShutdownTimer = setTimeout(() => {
      this.idleShutdownTimer = null;
      if (!this.isChildUsable() || this.pendingRequests.size > 0) {
        return;
      }
      void this.close();
    }, idleShutdownMs);
  }

  private isChildUsable(): boolean {
    return Boolean(this.child && !this.child.killed && this.child.exitCode === null);
  }

  private async validateLaunchConfig(): Promise<NativeDesktopHelperLaunchResolution> {
    if (this.config.cwd) {
      try {
        const stat = await fs.stat(this.config.cwd);
        if (!stat.isDirectory()) {
          throw new Error("not a directory");
        }
      } catch {
        throw new Error(
          `Configured native_desktop helper cwd does not exist or is not a directory: ${this.config.cwd}. Check ${BELLDANDY_CAMERA_NATIVE_HELPER_CWD_ENV}.`,
        );
      }
    }

    const resolvedLaunch = await resolveNativeDesktopHelperLaunch(this.config, {
      env: this.launchEnv,
    });

    if (looksLikeNativeDesktopLaunchPath(this.config.command)) {
      try {
        const stat = await fs.stat(resolvedLaunch.effectiveCommand);
        if (!stat.isFile()) {
          throw new Error("not a file");
        }
      } catch {
        throw new Error(
          `Configured native_desktop helper command path does not exist: ${resolvedLaunch.effectiveCommand}. Check ${BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV}. ${buildStartupHint(this.config, resolvedLaunch)}`,
        );
      }
    }

    if (isLikelyNodeCommand(this.config.command)) {
      if (!resolvedLaunch.helperEntry) {
        throw new Error(
          `native_desktop helper uses node but no helper entry path was found in ${BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV}. ${buildStartupHint(this.config, resolvedLaunch)}`,
        );
      }
      try {
        const stat = await fs.stat(resolvedLaunch.helperEntry.resolvedPath);
        if (!stat.isFile()) {
          throw new Error("not a file");
        }
      } catch {
        throw new Error(
          `Configured native_desktop helper entry does not exist: ${resolvedLaunch.helperEntry.resolvedPath}. Check ${BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV}. ${buildStartupHint(this.config, resolvedLaunch)}`,
        );
      }
    }
    return resolvedLaunch;
  }

  private async ensureSpawned(context: CameraProviderContext): Promise<void> {
    if (this.isChildUsable()) {
      this.clearIdleShutdownTimer();
      return;
    }
    throwIfAborted(context.abortSignal);
    const resolvedLaunch = await this.validateLaunchConfig();
    this.generation += 1;
    const child = this.spawnProcess(resolvedLaunch.effectiveCommand, resolvedLaunch.effectiveArgs, {
      cwd: this.config.cwd,
      env: {
        ...process.env,
        ...(this.config.env ?? {}),
      },
      stdio: "pipe",
      windowsHide: true,
      shell: false,
    });
    this.child = child;
    this.stderrLines = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    this.stdoutReader = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    this.stderrReader = readline.createInterface({
      input: child.stderr,
      crlfDelay: Infinity,
    });

    this.stdoutReader.on("line", (line) => {
      void this.handleStdoutLine(line, context);
    });
    this.stderrReader.on("line", (line) => {
      this.handleStderrLine(line, context);
    });

    child.on("error", (error) => {
      const launchHint = buildStartupHint(this.config, resolvedLaunch);
      const spawnError = error as NodeJS.ErrnoException;
      const processErrorMessage = spawnError.code === "ENOENT"
        ? looksLikeNativeDesktopLaunchPath(this.config.command)
          ? `native_desktop helper process error: launch command path was not found. ${launchHint}`
          : `native_desktop helper process error: command "${this.config.command}" was not found on PATH. ${launchHint}`
        : spawnError.code === "EACCES"
          ? `native_desktop helper process error: command "${this.config.command}" is not executable. ${launchHint}`
          : `native_desktop helper process error: ${error.message}. ${launchHint}`;
      this.handleProcessFailure(
        formatProcessFailure({
          message: processErrorMessage,
          stderrLines: this.stderrLines,
        }),
        context,
      );
    });
    child.on("exit", (code, signal) => {
      const launchHint = buildStartupHint(this.config, resolvedLaunch);
      this.handleProcessFailure(
        formatProcessFailure({
          message: `native_desktop helper exited before request completed (code=${code ?? "null"}, signal=${signal ?? "null"}). ${launchHint}`,
          stderrLines: this.stderrLines,
        }),
        context,
      );
    });
  }

  private async ensureReady(context: CameraProviderContext): Promise<void> {
    if (this.lastHelloResponse && this.isChildUsable()) {
      return;
    }
    if (!this.ensureReadyPromise) {
      this.ensureReadyPromise = (async () => {
        const linked = createLinkedAbortController({
          signal: context.abortSignal,
          timeoutMs: this.getStartupTimeoutMs(),
          timeoutReason: `native_desktop helper startup timed out after ${this.getStartupTimeoutMs()}ms.`,
        });
        try {
          await this.ensureSpawned({
            ...context,
            abortSignal: linked.controller.signal,
          });
          const response = await this.hello(buildHelloRequest(context), {
            ...context,
            abortSignal: linked.controller.signal,
          });
          this.acceptHelloResponse(response);
        } catch (error) {
          await this.close();
          if (linked.wasTimedOut()) {
            throw new Error(
              `native_desktop helper startup timed out after ${this.getStartupTimeoutMs()}ms. ${buildStartupHint(this.config)}`,
            );
          }
          throw error;
        } finally {
          linked.cleanup();
          this.ensureReadyPromise = null;
        }
      })();
    }
    return this.ensureReadyPromise;
  }

  private acceptHelloResponse(response: CameraNativeDesktopHelperHelloResponse): void {
    if (response.protocol !== CAMERA_NATIVE_DESKTOP_PROTOCOL_ID) {
      throw new Error(
        `native_desktop helper protocol mismatch: expected ${CAMERA_NATIVE_DESKTOP_PROTOCOL_ID}, received ${response.protocol}.`,
      );
    }
    this.lastHelloResponse = response;
  }

  private async handleStdoutLine(
    line: string,
    context: CameraProviderContext,
  ): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let message: CameraNativeDesktopHelperMessage;
    try {
      message = JSON.parse(trimmed) as CameraNativeDesktopHelperMessage;
    } catch (error) {
      this.handleProcessFailure(
        formatProcessFailure({
          message: `native_desktop helper emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}.`,
          stderrLines: this.stderrLines,
        }),
        context,
      );
      return;
    }
    if ((message as { protocol?: unknown }).protocol !== CAMERA_NATIVE_DESKTOP_PROTOCOL_ID) {
      this.handleProcessFailure(
        formatProcessFailure({
          message: `native_desktop helper protocol mismatch: expected ${CAMERA_NATIVE_DESKTOP_PROTOCOL_ID}, received ${String((message as { protocol?: unknown }).protocol ?? "<missing>")}.`,
          stderrLines: this.stderrLines,
        }),
        context,
      );
      return;
    }
    if ((message as { kind?: unknown }).kind === "event") {
      this.handleEventMessage(
        message as Extract<CameraNativeDesktopHelperMessage, { kind: "event" }>,
        context,
      );
      return;
    }
    if ((message as { kind?: unknown }).kind !== "response") {
      this.handleProcessFailure(
        formatProcessFailure({
          message: "native_desktop helper emitted a message that is not a response/event envelope.",
          stderrLines: this.stderrLines,
        }),
        context,
      );
      return;
    }
    const response = message as CameraNativeDesktopHelperResponseMessage;
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      context.logger?.debug?.(`[camera-native-desktop] dropping late or unknown response ${response.id}`);
      return;
    }
    this.pendingRequests.delete(response.id);
    pending.cleanup();
    if (!isNativeDesktopHelperMethod(response.method) || response.method !== pending.method) {
      pending.reject(new Error(
        `native_desktop helper response method mismatch: expected ${pending.method}, received ${String(response.method)}.`,
      ));
      return;
    }
    if (response.ok) {
      pending.resolve(response.result);
      return;
    }
    const details = response.error.issues?.map((item) => item.message).filter(Boolean).join("; ");
    pending.reject(new Error(
      details
        ? `${response.error.code}: ${response.error.message}. ${details}`
        : `${response.error.code}: ${response.error.message}`,
    ));
  }

  private handleEventMessage(
    message: Extract<CameraNativeDesktopHelperMessage, { kind: "event" }>,
    context: CameraProviderContext,
  ): void {
    switch (message.event) {
      case "device_change":
        context.logger?.info?.(
          `[camera-native-desktop] device change observed (${message.payload.reason}) at ${message.payload.observedAt}`,
        );
        return;
      case "health":
        context.logger?.info?.(
          `[camera-native-desktop] helper health=${message.payload.status} helperStatus=${message.payload.helperStatus}`,
        );
        return;
      case "log":
        context.logger?.debug?.(
          `[camera-native-desktop][helper:${message.payload.level}] ${message.payload.message}`,
        );
        return;
    }
  }

  private handleStderrLine(
    line: string,
    context: CameraProviderContext,
  ): void {
    if (!line.trim()) {
      return;
    }
    this.stderrLines.push(line);
    if (this.stderrLines.length > MAX_STDERR_LINES) {
      this.stderrLines.splice(0, this.stderrLines.length - MAX_STDERR_LINES);
    }
    context.logger?.warn?.(`[camera-native-desktop][stderr] ${line}`);
  }

  private handleProcessFailure(
    error: Error,
    context: CameraProviderContext,
  ): void {
    if (!this.child && !this.stdoutReader && !this.stderrReader) {
      return;
    }
    context.logger?.error?.(`[camera-native-desktop] ${error.message}`);
    this.child = null;
    this.lastHelloResponse = null;
    this.ensureReadyPromise = null;
    this.clearIdleShutdownTimer();
    this.stdoutReader?.close();
    this.stderrReader?.close();
    this.stdoutReader = null;
    this.stderrReader = null;
    this.rejectPendingRequests(error);
  }

  private rejectPendingRequests(error: Error): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      this.pendingRequests.delete(requestId);
      pending.cleanup();
      pending.reject(error);
    }
  }

  private async sendRequest<TMethod extends CameraNativeDesktopHelperMethod>(
    method: TMethod,
    params: CameraNativeDesktopHelperRequestParams[TMethod],
    context: CameraProviderContext,
    options: {
      timeoutMs?: number;
    } = {},
  ): Promise<CameraNativeDesktopHelperResponseResult[TMethod]> {
    const child = this.child;
    if (!child || !child.stdin.writable) {
      throw new Error("native_desktop helper is not running.");
    }
    throwIfAborted(context.abortSignal);
    this.clearIdleShutdownTimer();
    const timeoutMs = this.getRequestTimeoutMs(options.timeoutMs);
    const request = createNativeDesktopHelperRequest(method, params);
    return await new Promise<CameraNativeDesktopHelperResponseResult[TMethod]>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`native_desktop helper ${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      const onAbort = () => {
        cleanup();
        reject(toAbortError(readAbortReason(context.abortSignal)));
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        context.abortSignal?.removeEventListener("abort", onAbort);
        this.pendingRequests.delete(request.id);
        this.scheduleIdleShutdown();
      };

      context.abortSignal?.addEventListener("abort", onAbort, { once: true });
      this.pendingRequests.set(request.id, {
        method,
        resolve: (value) => resolve(value as CameraNativeDesktopHelperResponseResult[TMethod]),
        reject,
        cleanup,
      });

      child.stdin.write(`${JSON.stringify(request)}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }
        cleanup();
        reject(new Error(`Failed to write ${method} request to native_desktop helper: ${error.message}`));
      });
    });
  }
}
