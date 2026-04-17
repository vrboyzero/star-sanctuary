import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  type CameraNativeDesktopHelperCaptureSnapshotRequest,
  type CameraNativeDesktopHelperDiagnoseRequest,
  type CameraNativeDesktopHelperHelloRequest,
  type CameraNativeDesktopHelperListDevicesRequest,
  type CameraNativeDesktopHelperShutdownRequest,
} from "./camera-native-desktop-contract.js";
import {
  createNativeDesktopHelperErrorResponse,
  isNativeDesktopHelperMethod,
  type CameraNativeDesktopHelperRequestMessage,
} from "./camera-native-desktop-protocol.js";
import { NativeDesktopHelperRuntimeError, NativeDesktopWindowsHelperRuntime } from "./camera-native-desktop-helper-runtime.js";

function writeMessage(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toProtocolError(error: unknown) {
  if (error instanceof NativeDesktopHelperRuntimeError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.retryable ? { retryable: true } : {}),
      ...(error.issues ? { issues: error.issues } : {}),
      ...(error.metadata ? { metadata: error.metadata } : {}),
    };
  }
  return {
    code: "unknown" as const,
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function startNativeDesktopHelperServer(): Promise<void> {
  const runtime = new NativeDesktopWindowsHelperRuntime();
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on("line", (line) => {
    void handleRequestLine(line, runtime);
  });
}

async function handleRequestLine(
  line: string,
  runtime: NativeDesktopWindowsHelperRuntime,
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let request: CameraNativeDesktopHelperRequestMessage;
  try {
    request = JSON.parse(trimmed) as CameraNativeDesktopHelperRequestMessage;
  } catch (error) {
    console.error(`[camera-native-desktop-helper] invalid JSON request: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (request.kind !== "request" || !isNativeDesktopHelperMethod(request.method)) {
    writeMessage(createNativeDesktopHelperErrorResponse({
      id: request.id,
      method: isNativeDesktopHelperMethod(request.method) ? request.method : "hello",
    }, {
      code: "invalid_request",
      message: "native_desktop helper received an invalid request envelope.",
    }));
    return;
  }

  if (request.protocol !== "camera-native-desktop/v1") {
    writeMessage(createNativeDesktopHelperErrorResponse(request, {
      code: "protocol_mismatch",
      message: `native_desktop helper expected protocol camera-native-desktop/v1 but received ${request.protocol}.`,
    }));
    return;
  }

  try {
    let result: unknown;
    switch (request.method) {
      case "hello":
        result = await runtime.hello(request.params as CameraNativeDesktopHelperHelloRequest);
        break;
      case "diagnose":
        result = await runtime.diagnose(request.params as CameraNativeDesktopHelperDiagnoseRequest);
        break;
      case "list_devices":
        result = await runtime.listDevices(request.params as CameraNativeDesktopHelperListDevicesRequest);
        break;
      case "capture_snapshot":
        result = await runtime.captureSnapshot(request.params as CameraNativeDesktopHelperCaptureSnapshotRequest);
        break;
      case "shutdown":
        result = await runtime.shutdown(request.params as CameraNativeDesktopHelperShutdownRequest);
        break;
      case "capture_clip":
        throw new NativeDesktopHelperRuntimeError({
          code: "unsupported_method",
          message: "capture_clip is not implemented by the Windows native_desktop helper yet.",
        });
      default:
        throw new NativeDesktopHelperRuntimeError({
          code: "unsupported_method",
          message: `Unsupported helper method: ${request.method satisfies never}`,
        });
    }

    writeMessage({
      kind: "response",
      protocol: "camera-native-desktop/v1",
      id: request.id,
      method: request.method,
      ok: true,
      result,
    });

    if (request.method === "shutdown") {
      process.exitCode = 0;
      process.nextTick(() => process.exit(0));
    }
  } catch (error) {
    writeMessage(createNativeDesktopHelperErrorResponse(request, toProtocolError(error)));
  }
}

export async function isNativeDesktopHelperEntrypoint(
  argvPath: string | undefined,
  moduleUrl: string,
  realpathImpl: (targetPath: string) => Promise<string> = fs.realpath,
): Promise<boolean> {
  if (!argvPath) {
    return false;
  }

  const resolvedArgPath = path.resolve(argvPath);
  const modulePath = fileURLToPath(moduleUrl);

  if (modulePath === resolvedArgPath || moduleUrl === pathToFileURL(resolvedArgPath).href) {
    return true;
  }

  try {
    const [realArgPath, realModulePath] = await Promise.all([
      realpathImpl(resolvedArgPath),
      realpathImpl(modulePath),
    ]);
    return realArgPath === realModulePath;
  } catch {
    return false;
  }
}

async function maybeStartNativeDesktopHelperServer(): Promise<void> {
  if (await isNativeDesktopHelperEntrypoint(process.argv[1], import.meta.url)) {
    await startNativeDesktopHelperServer();
  }
}

void maybeStartNativeDesktopHelperServer();
