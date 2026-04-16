import type { Tool, ToolCallResult } from "../../types.js";

import {
  captureCameraSnapshot,
  listCameraDevices,
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

export const cameraSnapTool: Tool = {
  definition: {
    name: "camera_snap",
    description: "使用连接的浏览器调用摄像头拍摄照片，并返回截图路径与设备元信息。",
    parameters: {
      type: "object",
      properties: {
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
      return failure(
        "camera_snap",
        `无法捕获摄像头画面: ${error instanceof Error ? error.message : String(error)}。请确认浏览器已连接、镜像页已授权摄像头。`,
        startedAt,
      );
    }
  },
};

export const cameraListTool: Tool = {
  definition: {
    name: "camera_list",
    description: "列出当前浏览器可见的摄像头设备，并返回镜像页当前选中的设备与状态。",
    parameters: {
      type: "object",
      properties: {
        facing: {
          type: "string",
          description: "优先探测的默认摄像头朝向。",
          enum: ["front", "back"],
        },
        deviceId: {
          type: "string",
          description: "可选目标 deviceId；传入后镜像页会优先尝试该设备。",
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
      return failure(
        "camera_list",
        `无法列出摄像头设备: ${error instanceof Error ? error.message : String(error)}。请确认浏览器已连接，并允许镜像页访问摄像头。`,
        startedAt,
      );
    }
  },
};
