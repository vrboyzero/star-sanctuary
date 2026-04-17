import type { Tool, ToolCallResult } from "../../types.js";
import { isAbortError, readAbortReason } from "../../abort-utils.js";
import { CAMERA_PROVIDER_IDS } from "./camera-contract.js";
import {
  listCameraDeviceAliasMemoryEntries,
  removeCameraDeviceAliasMemoryEntry,
  upsertCameraDeviceAliasMemoryEntry,
} from "./camera-device-alias-state.js";
import {
  captureCameraSnapshot,
  listCameraDevices,
} from "./camera-provider-registry.js";

import {
  normalizeCameraCaptureOptions,
  normalizeCameraListOptions,
} from "./camera-runtime.js";
import { getCameraRecoveryHintText } from "./camera-governance.js";

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
  const recoveryHint = getCameraRecoveryHintText(code);
  switch (code) {
    case "device_busy":
      return `摄像头当前被其他应用占用: ${detail}。${recoveryHint ?? "请先关闭正在使用该摄像头的会议或录制软件后重试。"}`;
    case "device_not_found":
      return operation === "list"
        ? `未找到匹配的摄像头设备: ${detail}。`
        : `无法找到可用于拍照的摄像头设备: ${detail}。`;
    case "helper_unavailable":
      return `当前摄像头 provider 环境未就绪: ${detail}。${recoveryHint ?? "请确认 helper、PowerShell、ffmpeg 与相关环境变量配置正确。"}`;
    case "capture_failed":
      return `摄像头拍摄失败: ${detail}。${recoveryHint ? `建议：${recoveryHint}` : ""}`.trim();
    default:
      return operation === "list"
        ? `无法列出摄像头设备: ${rawMessage}。${recoveryHint ?? "请确认所选 provider 已注册，且当前 provider 所需环境已就绪。"}`
        : `无法捕获摄像头画面: ${rawMessage}。${recoveryHint ?? "请确认所选 provider 已注册，且当前 provider 所需环境已就绪。"}`;
  }
}

function requireCameraStateDir(stateDir: string | undefined): string {
  if (typeof stateDir === "string" && stateDir.trim()) {
    return stateDir;
  }
  throw new Error("camera_device_memory requires stateDir.");
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
          description: "显式指定摄像头 provider；不传时按 registry 默认选择策略路由，当前优先 native_desktop，其次 browser_loopback。",
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
          description: "显式指定摄像头 provider；不传时按 registry 默认选择策略路由，当前优先 native_desktop，其次 browser_loopback。",
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

export const cameraDeviceMemoryTool: Tool = {
  definition: {
    name: "camera_device_memory",
    description: "管理摄像头设备别名与常用设备记忆；支持列出、设置和移除 state-dir 中的持久化设备记忆。",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "要执行的记忆管理动作。",
          enum: ["list", "upsert", "remove"],
        },
        provider: {
          type: "string",
          description: "可选 provider 过滤；upsert/remove 不传时会尝试从 deviceRef 前缀解析。",
          enum: [...CAMERA_PROVIDER_IDS],
        },
        deviceRef: {
          type: "string",
          description: "provider-aware 设备引用；upsert/remove 必填。",
        },
        stableKey: {
          type: "string",
          description: "可选稳定设备键；提供后会优先用于跨重插槽/重枚举保持同一记忆条目。",
        },
        alias: {
          type: "string",
          description: "手动别名；upsert 时传空字符串可清除手动别名并回退到 learned alias。",
        },
        favorite: {
          type: "boolean",
          description: "是否标记为常用设备；仅 upsert 使用。",
        },
        label: {
          type: "string",
          description: "可选设备标签；仅在 upsert 新建条目时用作 learned alias 候选。",
        },
      },
      required: ["action"],
    },
  },
  execute: async (args, context) => {
    const startedAt = Date.now();
    try {
      const input = args as Record<string, unknown>;
      const action = typeof input.action === "string" ? input.action.trim().toLowerCase() : "";
      const stateDir = requireCameraStateDir(context.stateDir);
      switch (action) {
        case "list":
          return success("camera_device_memory", {
            action,
            ...await listCameraDeviceAliasMemoryEntries(stateDir, {
              ...(typeof input.provider === "string" ? { provider: input.provider as typeof CAMERA_PROVIDER_IDS[number] } : {}),
            }),
          }, startedAt);
        case "upsert":
          return success("camera_device_memory", {
            action,
            ...await upsertCameraDeviceAliasMemoryEntry(stateDir, {
              ...(typeof input.provider === "string" ? { provider: input.provider as typeof CAMERA_PROVIDER_IDS[number] } : {}),
              deviceRef: typeof input.deviceRef === "string" ? input.deviceRef : "",
              ...(typeof input.stableKey === "string" ? { stableKey: input.stableKey } : {}),
              ...(typeof input.label === "string" ? { label: input.label } : {}),
              ...(Object.prototype.hasOwnProperty.call(input, "alias") ? { alias: typeof input.alias === "string" ? input.alias : null } : {}),
              ...(typeof input.favorite === "boolean" ? { favorite: input.favorite } : {}),
            }),
          }, startedAt);
        case "remove":
          return success("camera_device_memory", {
            action,
            ...await removeCameraDeviceAliasMemoryEntry(stateDir, {
              ...(typeof input.provider === "string" ? { provider: input.provider as typeof CAMERA_PROVIDER_IDS[number] } : {}),
              deviceRef: typeof input.deviceRef === "string" ? input.deviceRef : "",
              ...(typeof input.stableKey === "string" ? { stableKey: input.stableKey } : {}),
            }),
          }, startedAt);
        default:
          throw new Error("camera_device_memory requires action=list|upsert|remove.");
      }
    } catch (error) {
      return failure("camera_device_memory", error, startedAt);
    }
  },
};
