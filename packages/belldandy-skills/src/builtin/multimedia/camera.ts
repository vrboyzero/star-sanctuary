import type { Tool, ToolCallResult } from "../../types.js";
import { isAbortError, readAbortReason } from "../../abort-utils.js";
import { CAMERA_PROVIDER_IDS } from "./camera-contract.js";
import {
  captureCameraSnapshot,
  listCameraDevices,
} from "./camera-provider-registry.js";

import {
  normalizeCameraCaptureOptions,
  normalizeCameraListOptions,
} from "./camera-runtime.js";

function success(name: string, output: unknown, startedAt: number): ToolCallResult {
  return {
    id: "generated-in-execute",
    name,
    success: true,
    output: JSON.stringify(output, null, 2),
    durationMs: Date.now() - startedAt,
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

function parseCameraErrorCode(message: string): {
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

function formatCameraOperationError(
  operation: "list" | "snap",
  error: unknown,
): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const { code, detail } = parseCameraErrorCode(rawMessage);
  switch (code) {
    case "device_busy":
      return `摄像头当前被其他应用占用: ${detail}。请先关闭正在使用该摄像头的会议或录制软件后重试。`;
    case "device_not_found":
      return operation === "list"
        ? `未找到匹配的摄像头设备: ${detail}。`
        : `无法找到可用于拍照的摄像头设备: ${detail}。`;
    case "helper_unavailable":
      return `当前摄像头 provider 环境未就绪: ${detail}。请确认 helper、PowerShell、ffmpeg 与相关环境变量配置正确。`;
    case "capture_failed":
      return `摄像头拍摄失败: ${detail}。`;
    default:
      return operation === "list"
        ? `无法列出摄像头设备: ${rawMessage}。请确认所选 provider 已注册，且当前 provider 所需环境已就绪。`
        : `无法捕获摄像头画面: ${rawMessage}。请确认所选 provider 已注册，且当前 provider 所需环境已就绪。`;
  }
}

export const cameraSnapTool: Tool = {
  definition: {
    name: "camera_snap",
    description: "通过已注册的摄像头 provider 拍摄照片，并返回截图路径与运行时状态。",
    parameters: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "显式指定摄像头 provider；Phase 3A 当前默认可用 browser_loopback。",
          enum: [...CAMERA_PROVIDER_IDS],
        },
        delay: {
          type: "number",
          description: "拍摄前的延迟毫秒数，用于等待对焦、曝光或页面稳定。",
        },
        facing: {
          type: "string",
          description: "优先使用的摄像头朝向。",
          enum: ["front", "back"],
        },
        deviceId: {
          type: "string",
          description: "指定 enumerateDevices 返回的摄像头 deviceId。",
        },
        deviceRef: {
          type: "string",
          description: "推荐优先于 deviceId 的 provider-aware 设备引用；browser_loopback 已支持回传后复用。",
        },
        width: {
          type: "number",
          description: "期望视频宽度。",
        },
        height: {
          type: "number",
          description: "期望视频高度。",
        },
        fit: {
          type: "string",
          description: "镜像页视频填充方式。",
          enum: ["cover", "contain"],
        },
        name: {
          type: "string",
          description: "可选截图文件名前缀。",
        },
        mirror: {
          type: "boolean",
          description: "是否在镜像页里左右翻转画面，默认 true。",
        },
        readyTimeoutMs: {
          type: "number",
          description: "等待摄像头进入 ready 状态的超时时间。",
        },
      },
      required: [],
    },
  },
  execute: async (args, context) => {
    const startedAt = Date.now();
    try {
      const options = normalizeCameraCaptureOptions(args as Record<string, unknown>);
      const result = await captureCameraSnapshot(context, options);
      return success("camera_snap", {
        provider: result.provider,
        path: result.path,
        mirrorUrl: result.mirrorUrl,
        state: result.state,
      }, startedAt);
    } catch (error) {
      if (isAbortError(error) || context.abortSignal?.aborted) {
        return failure("camera_snap", readAbortReason(context.abortSignal), startedAt);
      }
      return failure(
        "camera_snap",
        formatCameraOperationError("snap", error),
        startedAt,
      );
    }
  },
};

export const cameraListTool: Tool = {
  definition: {
    name: "camera_list",
    description: "列出当前 provider 可见的摄像头设备，并返回当前选中设备与运行时状态。",
    parameters: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "显式指定摄像头 provider；Phase 3A 当前默认可用 browser_loopback。",
          enum: [...CAMERA_PROVIDER_IDS],
        },
        facing: {
          type: "string",
          description: "优先探测的默认摄像头朝向。",
          enum: ["front", "back"],
        },
        deviceId: {
          type: "string",
          description: "可选目标 deviceId；传入后镜像页会优先尝试该设备。",
        },
        deviceRef: {
          type: "string",
          description: "推荐优先于 deviceId 的 provider-aware 设备引用；browser_loopback 已支持回传后复用。",
        },
        width: {
          type: "number",
          description: "期望视频宽度。",
        },
        height: {
          type: "number",
          description: "期望视频高度。",
        },
        fit: {
          type: "string",
          description: "镜像页视频填充方式。",
          enum: ["cover", "contain"],
        },
        mirror: {
          type: "boolean",
          description: "是否在镜像页里左右翻转画面，默认 true。",
        },
        readyTimeoutMs: {
          type: "number",
          description: "等待摄像头进入 ready 状态的超时时间。",
        },
      },
      required: [],
    },
  },
  execute: async (args, context) => {
    const startedAt = Date.now();
    try {
      const options = normalizeCameraListOptions(args as Record<string, unknown>);
      const result = await listCameraDevices(context, options);
      return success("camera_list", result, startedAt);
    } catch (error) {
      if (isAbortError(error) || context.abortSignal?.aborted) {
        return failure("camera_list", readAbortReason(context.abortSignal), startedAt);
      }
      return failure(
        "camera_list",
        formatCameraOperationError("list", error),
        startedAt,
      );
    }
  },
};
