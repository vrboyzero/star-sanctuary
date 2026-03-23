/**
 * Cron 定时任务管理工具 - 供 Agent 创建、管理和查看定时任务
 *
 * 支持 4 个 action：
 * - list：列出所有定时任务
 * - add：创建新的定时任务
 * - remove：删除指定任务
 * - status：查看调度器状态
 *
 * 注意：类型通过接口抽象注入，避免 skills→core 的循环依赖。
 * gateway.ts 负责注入 CronStore 和 CronSchedulerHandle 实例。
 */

import crypto from "node:crypto";
import type { Tool, ToolContext, ToolCallResult, JsonObject } from "../types.js";

// ── 依赖接口（避免直接导入 @belldandy/core，防止循环依赖） ──

/** CronStore 的最小接口，由 gateway 注入实际实例 */
export interface ICronStore {
    list(): Promise<CronJobView[]>;
    add(input: CronJobCreateInput): Promise<CronJobView>;
    remove(id: string): Promise<boolean>;
}

/** 调度器状态查询接口 */
export interface ICronSchedulerStatus {
    running: boolean;
    activeRuns: number;
    lastTickAtMs?: number;
}

export interface ICronSchedulerHandle {
    status(): ICronSchedulerStatus;
}

// ── 视图类型（只用于工具展示） ──

interface CronJobView {
    id: string;
    name: string;
    enabled: boolean;
    schedule: { kind: string; at?: string; everyMs?: number };
    payload:
        | { kind: "systemEvent"; text: string }
        | { kind: "goalApprovalScan"; goalId?: string; goalIds?: string[]; allGoals?: boolean; autoEscalate?: boolean };
    state: {
        nextRunAtMs?: number;
        lastRunAtMs?: number;
        lastStatus?: string;
    };
}

interface CronJobCreateInput {
    name: string;
    schedule: { kind: "at"; at: string } | { kind: "every"; everyMs: number; anchorMs?: number };
    payload:
        | { kind: "systemEvent"; text: string }
        | { kind: "goalApprovalScan"; goalId?: string; goalIds?: string[]; allGoals?: boolean; autoEscalate?: boolean };
    deleteAfterRun?: boolean;
}

// ── 工具依赖 ──

export type CronToolDeps = {
    store: ICronStore;
    scheduler?: ICronSchedulerHandle;
};

/**
 * 创建 Cron 工具实例
 * 需要外部注入 CronStore（因为 store 是单例，在 gateway 启动时创建）
 */
export function createCronTool(deps: CronToolDeps): Tool {
    const { store, scheduler } = deps;

    return {
        definition: {
            name: "cron",
            description: `管理定时任务（计划任务/Cron Jobs）。可以创建、列出和删除定时任务。

ACTIONS:
- list: 列出所有任务
- add: 创建新任务
- remove: 删除任务（需要 jobId）
- status: 查看调度器状态

payload 类型:
- systemEvent: 发送文本给 Agent 执行
- goalApprovalScan: 直接执行长期任务审批扫描（suggestion review + checkpoint workflow）

创建任务 (add) 参数:
- name: 任务名称（必填）
- payloadKind: payload 类型，默认 systemEvent
- text: 发送给 Agent 的文本/提示（payloadKind=systemEvent 时必填）
- goalId: 指定单个 goal 扫描（payloadKind=goalApprovalScan 时可填）
- allGoals: 扫描全部 goal（payloadKind=goalApprovalScan 时可填）
- autoEscalate: 是否自动升级超时 stage（payloadKind=goalApprovalScan 时可填，默认 true）
- scheduleKind: 调度类型 "at" 或 "every"（必填）
- at: 一次性触发时间，ISO-8601 格式（scheduleKind="at" 时必填，如 "2026-02-10T09:00:00+08:00"）
- everyMs: 重复间隔毫秒数（scheduleKind="every" 时必填，最小 60000 = 1分钟）
- deleteAfterRun: 执行后是否自动删除（仅 at 类型，默认 false）

快捷间隔参考:
- 1分钟 = 60000
- 5分钟 = 300000
- 30分钟 = 1800000
- 1小时 = 3600000
- 4小时 = 14400000
- 24小时 = 86400000`,
            parameters: {
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        description: "操作类型",
                        enum: ["list", "add", "remove", "status"],
                    },
                    jobId: {
                        type: "string",
                        description: "任务 ID（remove 时必填）",
                    },
                    name: {
                        type: "string",
                        description: "任务名称（add 时必填）",
                    },
                    payloadKind: {
                        type: "string",
                        description: "payload 类型：systemEvent 或 goalApprovalScan",
                        enum: ["systemEvent", "goalApprovalScan"],
                    },
                    text: {
                        type: "string",
                        description: "发送给 Agent 的提示文本（payloadKind=systemEvent 时必填）",
                    },
                    goalId: {
                        type: "string",
                        description: "指定单个 goal 扫描（payloadKind=goalApprovalScan 时可填）",
                    },
                    allGoals: {
                        type: "boolean",
                        description: "是否扫描全部 goal（payloadKind=goalApprovalScan 时可填）",
                    },
                    autoEscalate: {
                        type: "boolean",
                        description: "是否自动升级超时 stage（payloadKind=goalApprovalScan 时可填）",
                    },
                    scheduleKind: {
                        type: "string",
                        description: "调度类型：at（一次性）或 every（重复）",
                        enum: ["at", "every"],
                    },
                    at: {
                        type: "string",
                        description: "一次性触发时间，ISO-8601 格式（scheduleKind=at 时必填）",
                    },
                    everyMs: {
                        type: "number",
                        description: "重复间隔毫秒数（scheduleKind=every 时必填，最小 60000）",
                    },
                    deleteAfterRun: {
                        type: "boolean",
                        description: "执行后是否自动删除（仅 at 类型）",
                    },
                },
                required: ["action"],
            },
        },

        async execute(args: JsonObject, _context: ToolContext): Promise<ToolCallResult> {
            const start = Date.now();
            const id = crypto.randomUUID();
            const name = "cron";

            const makeResult = (success: boolean, output: string, error?: string): ToolCallResult => ({
                id,
                name,
                success,
                output,
                error,
                durationMs: Date.now() - start,
            });

            const action = typeof args.action === "string" ? args.action : "";

            try {
                switch (action) {
                    // ── list ──
                    case "list": {
                        const jobs = await store.list();
                        if (jobs.length === 0) {
                            return makeResult(true, "当前没有定时任务。");
                        }
                        const lines = jobs.map((j) => {
                            const scheduleDesc =
                                j.schedule.kind === "at"
                                    ? `一次性 @ ${j.schedule.at ?? "?"}`
                                    : `每 ${formatMs(j.schedule.everyMs ?? 0)} 重复`;
                            const payloadDesc = formatPayload(j.payload);
                            const statusDesc = j.enabled ? "✅ 启用" : "⏸️ 禁用";
                            const nextRun = j.state.nextRunAtMs
                                ? new Date(j.state.nextRunAtMs).toISOString()
                                : "无";
                            const lastRun = j.state.lastRunAtMs
                                ? `${new Date(j.state.lastRunAtMs).toISOString()} (${j.state.lastStatus ?? "unknown"})`
                                : "从未执行";
                            return [
                                `📋 ${j.name}`,
                                `   ID: ${j.id}`,
                                `   调度: ${scheduleDesc}`,
                                `   状态: ${statusDesc}`,
                                `   下次执行: ${nextRun}`,
                                `   上次执行: ${lastRun}`,
                                `   内容: ${payloadDesc}`,
                            ].join("\n");
                        });
                        return makeResult(true, `共 ${jobs.length} 个定时任务:\n\n${lines.join("\n\n")}`);
                    }

                    // ── add ──
                    case "add": {
                        const jobName = typeof args.name === "string" ? args.name.trim() : "";
                        const payloadKind = typeof args.payloadKind === "string" ? args.payloadKind : "systemEvent";
                        const scheduleKind = typeof args.scheduleKind === "string" ? args.scheduleKind : "";

                        if (!jobName) return makeResult(false, "", "参数错误：name 不能为空");

                        if (scheduleKind === "at") {
                            const at = typeof args.at === "string" ? args.at.trim() : "";
                            if (!at) return makeResult(false, "", "参数错误：scheduleKind=at 时 at 不能为空");

                            const atMs = new Date(at).getTime();
                            if (!Number.isFinite(atMs)) {
                                return makeResult(false, "", `参数错误：无法解析时间 "${at}"，请使用 ISO-8601 格式`);
                            }

                            const payloadResult = buildPayload(args, payloadKind);
                            if (!payloadResult.ok) {
                                return makeResult(false, "", payloadResult.error);
                            }

                            const job = await store.add({
                                name: jobName,
                                schedule: { kind: "at", at },
                                payload: payloadResult.payload,
                                deleteAfterRun: args.deleteAfterRun === true,
                            });
                            return makeResult(
                                true,
                                `✅ 已创建一次性任务 "${job.name}"\n   ID: ${job.id}\n   触发时间: ${at}\n   内容: ${formatPayload(job.payload)}`
                            );
                        }

                        if (scheduleKind === "every") {
                            const everyMs =
                                typeof args.everyMs === "number" ? Math.floor(args.everyMs) : 0;
                            if (everyMs < 60_000) {
                                return makeResult(
                                    false,
                                    "",
                                    "参数错误：everyMs 最小为 60000（1 分钟）"
                                );
                            }
                            const payloadResult = buildPayload(args, payloadKind);
                            if (!payloadResult.ok) {
                                return makeResult(false, "", payloadResult.error);
                            }
                            const job = await store.add({
                                name: jobName,
                                schedule: { kind: "every", everyMs, anchorMs: Date.now() },
                                payload: payloadResult.payload,
                            });
                            return makeResult(
                                true,
                                `✅ 已创建周期任务 "${job.name}"\n   ID: ${job.id}\n   间隔: 每 ${formatMs(everyMs)}\n   内容: ${formatPayload(job.payload)}`
                            );
                        }

                        return makeResult(
                            false,
                            "",
                            "参数错误：scheduleKind 必须为 'at' 或 'every'"
                        );
                    }

                    // ── remove ──
                    case "remove": {
                        const jobId = typeof args.jobId === "string" ? args.jobId.trim() : "";
                        if (!jobId) return makeResult(false, "", "参数错误：jobId 不能为空");
                        const removed = await store.remove(jobId);
                        if (!removed) {
                            return makeResult(false, "", `未找到 ID 为 "${jobId}" 的任务`);
                        }
                        return makeResult(true, `✅ 已删除任务 (ID: ${jobId})`);
                    }

                    // ── status ──
                    case "status": {
                        const jobs = await store.list();
                        const enabledCount = jobs.filter((j) => j.enabled).length;
                        const schedulerStatus = scheduler?.status();

                        const lines = [
                            `📊 Cron 调度器状态`,
                            `   调度器运行中: ${schedulerStatus?.running ?? "未知"}`,
                            `   总任务数: ${jobs.length}`,
                            `   启用任务: ${enabledCount}`,
                            `   当前并发: ${schedulerStatus?.activeRuns ?? 0}`,
                        ];

                        if (schedulerStatus?.lastTickAtMs) {
                            lines.push(
                                `   最后检查: ${new Date(schedulerStatus.lastTickAtMs).toISOString()}`
                            );
                        }
                        return makeResult(true, lines.join("\n"));
                    }

                    default:
                        return makeResult(false, "", `未知 action: "${action}"，支持: list/add/remove/status`);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return makeResult(false, "", `执行失败: ${message}`);
            }
        },
    };
}

// ── 辅助函数 ──

/** 毫秒转可读时间 */
function formatMs(ms: number): string {
    if (ms < 60_000) return `${ms}ms`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分钟`;
    if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}小时`;
    return `${(ms / 86_400_000).toFixed(1)}天`;
}

/** 截断文本 */
function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + "...";
}

function buildPayload(
    args: JsonObject,
    payloadKind: string,
): { ok: true; payload: CronJobCreateInput["payload"] } | { ok: false; error: string } {
    if (payloadKind === "goalApprovalScan") {
        const goalId = typeof args.goalId === "string" ? args.goalId.trim() : "";
        const allGoals = args.allGoals === true;
        if (!goalId && !allGoals) {
            return { ok: false, error: "参数错误：payloadKind=goalApprovalScan 时，goalId 和 allGoals 至少需要提供一个" };
        }
        return {
            ok: true,
            payload: {
                kind: "goalApprovalScan",
                goalId: goalId || undefined,
                allGoals,
                autoEscalate: typeof args.autoEscalate === "boolean" ? args.autoEscalate : true,
            },
        };
    }
    if (payloadKind !== "systemEvent") {
        return { ok: false, error: "参数错误：payloadKind 必须为 'systemEvent' 或 'goalApprovalScan'" };
    }
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (!text) {
        return { ok: false, error: "参数错误：payloadKind=systemEvent 时 text 不能为空" };
    }
    return {
        ok: true,
        payload: { kind: "systemEvent", text },
    };
}

function formatPayload(payload: CronJobView["payload"]): string {
    if (payload.kind === "systemEvent") {
        return truncate(payload.text, 80);
    }
    if (payload.allGoals) {
        return `approval scan / all goals / autoEscalate=${payload.autoEscalate !== false}`;
    }
    return `approval scan / goal=${payload.goalId ?? payload.goalIds?.join(", ") ?? "?"} / autoEscalate=${payload.autoEscalate !== false}`;
}
