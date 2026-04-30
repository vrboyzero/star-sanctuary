import path from "node:path";

import type { Tool, ToolCallResult } from "../../types.js";
import { isAbortError, readAbortReason } from "../../abort-utils.js";
import {
  type CameraNativeDesktopCaptureScreenRequest,
  type CameraNativeDesktopListCaptureTargetsRequest,
  type CameraNativeDesktopSnapshotFormat,
} from "./camera-native-desktop-contract.js";
import {
  NativeDesktopStdioHelperClient,
  readNativeDesktopHelperConfigFromEnv,
} from "./camera-native-desktop-stdio-client.js";
import { understandCapturedImageArtifact } from "./captured-image-understand.js";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function success(
  name: string,
  output: unknown,
  startedAt: number,
  metadata?: ToolCallResult["metadata"],
): ToolCallResult {
  return {
    id: "generated-in-execute",
    name,
    success: true,
    output: JSON.stringify(output, null, 2),
    durationMs: Date.now() - startedAt,
    ...(metadata ? { metadata } : {}),
  };
}

function failure(name: string, error: unknown, startedAt: number): ToolCallResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: "error",
    name,
    success: false,
    output: message,
    error: message,
    durationMs: Date.now() - startedAt,
  };
}

function parseErrorCode(message: string): {
  code?: string;
  detail: string;
} {
  const separatorIndex = message.indexOf(":");
  if (separatorIndex <= 0) {
    return {
      detail: message,
    };
  }
  const code = message.slice(0, separatorIndex).trim();
  if (!/^[a-z_]+$/u.test(code)) {
    return {
      detail: message,
    };
  }
  return {
    code,
    detail: message.slice(separatorIndex + 1).trim(),
  };
}

function formatScreenToolError(operation: "list" | "capture", error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const { code, detail } = parseErrorCode(rawMessage);
  switch (code) {
    case "helper_unavailable":
      return `当前 native_desktop helper 环境未就绪: ${detail}。请确认 helper、PowerShell 与 ffmpeg 配置正确。`;
    case "target_not_found":
    case "device_not_found":
      return operation === "list"
        ? `无法列出可用屏幕目标: ${detail}。`
        : `无法找到匹配的屏幕目标: ${detail}。`;
    case "capture_failed":
      return `屏幕截图失败: ${detail}。`;
    case "invalid_request":
      return `屏幕截图参数无效: ${detail}。`;
    default:
      return operation === "list"
        ? `无法列出屏幕目标: ${rawMessage}。`
        : `无法执行屏幕截图: ${rawMessage}。`;
  }
}

function resolveOutputPath(input: {
  workspaceRoot: string;
  name?: string;
  format: CameraNativeDesktopSnapshotFormat;
}): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = slugify(input.name || "screen-capture") || "screen-capture";
  return path.join(input.workspaceRoot, "screenshots", `${baseName}_${timestamp}.${input.format}`);
}

function createHelperClient(): NativeDesktopStdioHelperClient {
  const config = readNativeDesktopHelperConfigFromEnv();
  if (!config) {
    throw new Error("helper_unavailable: native_desktop helper is not configured. Set BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND first.");
  }
  return new NativeDesktopStdioHelperClient(config);
}

function normalizeListArgs(args: Record<string, unknown>): CameraNativeDesktopListCaptureTargetsRequest {
  return {
    includeDisplays: args.includeDisplays !== false,
    includeWindows: args.includeWindows !== false,
    includeMinimizedWindows: args.includeMinimizedWindows === true,
    ...(normalizeString(args.windowTitleFilter) ? { windowTitleFilter: normalizeString(args.windowTitleFilter) } : {}),
  };
}

function normalizeFormat(value: unknown): CameraNativeDesktopSnapshotFormat {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "jpeg" || normalized === "jpg") {
    return "jpeg";
  }
  return "png";
}

function normalizeCaptureArgs(
  args: Record<string, unknown>,
  workspaceRoot: string,
): CameraNativeDesktopCaptureScreenRequest {
  const targetKind = normalizeString(args.target).toLowerCase() || "desktop";
  const format = normalizeFormat(args.format);
  const outputPath = resolveOutputPath({
    workspaceRoot,
    name: normalizeString(args.name) || undefined,
    format,
  });

  let target: CameraNativeDesktopCaptureScreenRequest["target"];
  switch (targetKind) {
    case "desktop":
      target = { kind: "desktop" };
      break;
    case "display":
      target = {
        kind: "display",
        ...(normalizeString(args.displayId) ? { displayId: normalizeString(args.displayId) } : {}),
        ...(normalizeString(args.displayRef) ? { displayRef: normalizeString(args.displayRef) } : {}),
      };
      break;
    case "window":
      target = {
        kind: "window",
        ...(normalizeString(args.windowId) ? { windowId: normalizeString(args.windowId) } : {}),
        ...(normalizeString(args.windowRef) ? { windowRef: normalizeString(args.windowRef) } : {}),
        ...(normalizeString(args.windowTitle) ? { windowTitle: normalizeString(args.windowTitle) } : {}),
      };
      break;
    case "region": {
      const region = args.region as Record<string, unknown> | undefined;
      target = {
        kind: "region",
        x: Number(region?.x),
        y: Number(region?.y),
        width: Number(region?.width),
        height: Number(region?.height),
      };
      break;
    }
    default:
      throw new Error(`invalid_request: unsupported screen capture target "${targetKind}"`);
  }

  return {
    target,
    output: {
      filePath: outputPath,
      format,
    },
    ...(typeof args.delayMs === "number" ? { delayMs: args.delayMs } : {}),
    ...(typeof args.timeoutMs === "number" ? { timeoutMs: args.timeoutMs } : {}),
    ...(typeof args.includeCursor === "boolean" ? { includeCursor: args.includeCursor } : {}),
  };
}

export const screenListTargetsTool: Tool = {
  definition: {
    name: "screen_list_targets",
    description: "列出本机可截图的显示器与窗口目标。",
    parameters: {
      type: "object",
      properties: {
        includeDisplays: {
          type: "boolean",
          description: "是否返回显示器列表，默认 true。",
        },
        includeWindows: {
          type: "boolean",
          description: "是否返回窗口列表，默认 true。",
        },
        includeMinimizedWindows: {
          type: "boolean",
          description: "是否包含最小化窗口，默认 false。",
        },
        windowTitleFilter: {
          type: "string",
          description: "按标题过滤窗口，大小写不敏感。",
        },
      },
      required: [],
    },
  },
  execute: async (args, context) => {
    const startedAt = Date.now();
    let client: NativeDesktopStdioHelperClient | undefined;
    try {
      client = createHelperClient();
      const result = await client.listCaptureTargets(normalizeListArgs(args as Record<string, unknown>), context);
      return success("screen_list_targets", result, startedAt);
    } catch (error) {
      if (isAbortError(error) || context.abortSignal?.aborted) {
        return failure("screen_list_targets", readAbortReason(context.abortSignal), startedAt);
      }
      return failure("screen_list_targets", formatScreenToolError("list", error), startedAt);
    } finally {
      await client?.close().catch(() => {});
    }
  },
};

export const screenCaptureTool: Tool = {
  definition: {
    name: "screen_capture",
    description: "捕获本机桌面、显示器、窗口或区域截图，并自动附带图片识别结果。",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "截图目标类型。",
          enum: ["desktop", "display", "window", "region"],
        },
        displayId: {
          type: "string",
          description: "当 target=display 时使用的显示器 ID。",
        },
        displayRef: {
          type: "string",
          description: "当 target=display 时优先使用的显示器引用。",
        },
        windowId: {
          type: "string",
          description: "当 target=window 时使用的窗口 ID（如 0x001A02BC）。",
        },
        windowRef: {
          type: "string",
          description: "当 target=window 时优先使用的窗口引用。",
        },
        windowTitle: {
          type: "string",
          description: "当 target=window 时可用于匹配窗口标题。",
        },
        region: {
          type: "object",
          description: "当 target=region 时使用的截图区域对象，需包含 x、y、width、height 四个数字字段。",
        },
        delayMs: {
          type: "number",
          description: "截图前延迟毫秒数。",
        },
        timeoutMs: {
          type: "number",
          description: "单次截图超时时间。",
        },
        includeCursor: {
          type: "boolean",
          description: "是否在桌面/区域截图中包含鼠标指针，默认 true。",
        },
        name: {
          type: "string",
          description: "可选截图文件名前缀。",
        },
        format: {
          type: "string",
          description: "截图输出格式。",
          enum: ["png", "jpeg", "jpg"],
        },
      },
      required: [],
    },
  },
  execute: async (args, context) => {
    const startedAt = Date.now();
    let client: NativeDesktopStdioHelperClient | undefined;
    try {
      client = createHelperClient();
      const captureRequest = normalizeCaptureArgs(args as Record<string, unknown>, context.workspaceRoot);
      const capture = await client.captureScreen(captureRequest, context);
      const imageUnderstanding = await understandCapturedImageArtifact({
        filePath: capture.artifact.path,
        mimeType: capture.artifact.format === "jpeg" ? "image/jpeg" : "image/png",
        stateDir: context.stateDir,
        abortSignal: context.abortSignal,
        autoUnderstandEnvName: "BELLDANDY_SCREEN_CAPTURE_AUTO_UNDERSTAND",
      });
      const payload = {
        path: capture.artifact.path,
        target: capture.target,
        artifact: capture.artifact,
        ...(capture.display ? { display: capture.display } : {}),
        ...(capture.window ? { window: capture.window } : {}),
        imageUnderstandingStatus: imageUnderstanding.status,
        ...(imageUnderstanding.status === "completed"
          ? {
            imageUnderstandingPreview: imageUnderstanding.preview,
            imageUnderstanding: imageUnderstanding.result,
          }
          : {}),
        ...(imageUnderstanding.status === "failed"
          ? {
            imageUnderstandingError: imageUnderstanding.error,
          }
          : {}),
      };
      return success("screen_capture", payload, startedAt, {
        imageUnderstandingStatus: imageUnderstanding.status,
      });
    } catch (error) {
      if (isAbortError(error) || context.abortSignal?.aborted) {
        return failure("screen_capture", readAbortReason(context.abortSignal), startedAt);
      }
      return failure("screen_capture", formatScreenToolError("capture", error), startedAt);
    } finally {
      await client?.close().catch(() => {});
    }
  },
};
