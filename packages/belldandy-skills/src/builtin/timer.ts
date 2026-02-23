/**
 * 计时器工具 - 供 Agent 进行时间测量和性能分析
 *
 * 支持多个命名计时器并发运行，精度 0.01 秒（10ms）
 */

import crypto from "node:crypto";
import type { Tool, ToolContext, ToolCallResult, JsonObject } from "../types.js";

/** 计时器状态 */
type TimerState = {
  name: string;
  startTime: number;
  laps: number[];
  running: boolean;
};

/** 全局计时器存储（进程内存，重启后清空） */
const timers = new Map<string, TimerState>();

/** 格式化时间（秒，保留 2 位小数） */
function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2);
}

/** timer 工具 - 统一入口 */
export const timerTool: Tool = {
  definition: {
    name: "timer",
    description: "计时器工具，支持开始、停止、中间计时、重置和列出所有计时器。最小精度 0.01 秒。",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "操作类型",
          enum: ["start", "stop", "lap", "reset", "list"],
        },
        name: {
          type: "string",
          description: "计时器名称（action=list 时可选，其他操作必填）",
        },
      },
      required: ["action"],
      oneOf: [
        { required: ["action", "name"] }, // start/stop/lap/reset 需要 name
        { required: ["action"] },          // list 不需要 name
      ],
    },
  },

  async execute(args: JsonObject, context: ToolContext): Promise<ToolCallResult> {
    const startTime = performance.now();
    const id = crypto.randomUUID();
    const action = args.action as string;
    const name = args.name as string | undefined;

    try {
      // list 操作不需要 name
      if (action === "list") {
        if (timers.size === 0) {
          return {
            id,
            name: "timer",
            success: true,
            output: "当前没有活动的计时器",
            durationMs: performance.now() - startTime,
          };
        }

        const lines: string[] = ["当前计时器列表："];
        for (const [timerName, state] of timers.entries()) {
          const elapsed = state.running
            ? performance.now() - state.startTime
            : state.laps.length > 0
              ? state.laps[state.laps.length - 1]
              : 0;
          const status = state.running ? "运行中" : "已停止";
          const lapsInfo = state.laps.length > 0 ? ` (${state.laps.length} 个中间计时)` : "";
          lines.push(`- ${timerName}: ${formatTime(elapsed)}s [${status}]${lapsInfo}`);
        }

        return {
          id,
          name: "timer",
          success: true,
          output: lines.join("\n"),
          durationMs: performance.now() - startTime,
        };
      }

      // 其他操作需要 name
      if (!name) {
        return {
          id,
          name: "timer",
          success: false,
          output: "",
          error: `操作 ${action} 需要提供 name 参数`,
          durationMs: performance.now() - startTime,
        };
      }

      switch (action) {
        case "start": {
          if (timers.has(name)) {
            const existing = timers.get(name)!;
            if (existing.running) {
              return {
                id,
                name: "timer",
                success: false,
                output: "",
                error: `计时器 "${name}" 已在运行中`,
                durationMs: performance.now() - startTime,
              };
            }
          }

          timers.set(name, {
            name,
            startTime: performance.now(),
            laps: [],
            running: true,
          });

          return {
            id,
            name: "timer",
            success: true,
            output: `计时器 "${name}" 已启动`,
            durationMs: performance.now() - startTime,
          };
        }

        case "stop": {
          const timer = timers.get(name);
          if (!timer) {
            return {
              id,
              name: "timer",
              success: false,
              output: "",
              error: `计时器 "${name}" 不存在`,
              durationMs: performance.now() - startTime,
            };
          }

          if (!timer.running) {
            return {
              id,
              name: "timer",
              success: false,
              output: "",
              error: `计时器 "${name}" 未在运行`,
              durationMs: performance.now() - startTime,
            };
          }

          const elapsed = performance.now() - timer.startTime;
          timer.running = false;
          timer.laps.push(elapsed);

          const lapsInfo = timer.laps.length > 1
            ? `\n中间计时: ${timer.laps.slice(0, -1).map((t) => formatTime(t) + "s").join(", ")}`
            : "";

          return {
            id,
            name: "timer",
            success: true,
            output: `计时器 "${name}" 已停止\n总用时: ${formatTime(elapsed)}s${lapsInfo}`,
            durationMs: performance.now() - startTime,
          };
        }

        case "lap": {
          const timer = timers.get(name);
          if (!timer) {
            return {
              id,
              name: "timer",
              success: false,
              output: "",
              error: `计时器 "${name}" 不存在`,
              durationMs: performance.now() - startTime,
            };
          }

          if (!timer.running) {
            return {
              id,
              name: "timer",
              success: false,
              output: "",
              error: `计时器 "${name}" 未在运行`,
              durationMs: performance.now() - startTime,
            };
          }

          const elapsed = performance.now() - timer.startTime;
          timer.laps.push(elapsed);

          return {
            id,
            name: "timer",
            success: true,
            output: `计时器 "${name}" 中间计时 #${timer.laps.length}: ${formatTime(elapsed)}s`,
            durationMs: performance.now() - startTime,
          };
        }

        case "reset": {
          const timer = timers.get(name);
          if (!timer) {
            return {
              id,
              name: "timer",
              success: false,
              output: "",
              error: `计时器 "${name}" 不存在`,
              durationMs: performance.now() - startTime,
            };
          }

          timers.delete(name);

          return {
            id,
            name: "timer",
            success: true,
            output: `计时器 "${name}" 已重置并删除`,
            durationMs: performance.now() - startTime,
          };
        }

        default:
          return {
            id,
            name: "timer",
            success: false,
            output: "",
            error: `未知操作: ${action}`,
            durationMs: performance.now() - startTime,
          };
      }
    } catch (err) {
      return {
        id,
        name: "timer",
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - startTime,
      };
    }
  },
};
