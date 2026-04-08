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
import { withToolContract } from "../tool-contract.js";

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
    sessionTarget: "main" | "isolated";
    schedule:
        | { kind: "at"; at: string }
        | { kind: "every"; everyMs: number; anchorMs?: number; staggerMs?: number }
        | { kind: "dailyAt"; time: string; timezone: string; staggerMs?: number }
        | { kind: "weeklyAt"; weekdays: number[]; time: string; timezone: string; staggerMs?: number };
    payload:
        | { kind: "systemEvent"; text: string }
        | { kind: "goalApprovalScan"; goalId?: string; goalIds?: string[]; allGoals?: boolean; autoEscalate?: boolean };
    delivery: { mode: "user" | "none"; bestEffort?: boolean };
    failureDestination?: { mode: "user" | "none" };
    state: {
        nextRunAtMs?: number;
        lastRunAtMs?: number;
        lastStatus?: string;
    };
}

interface CronJobCreateInput {
    name: string;
    schedule:
        | { kind: "at"; at: string }
        | { kind: "every"; everyMs: number; anchorMs?: number; staggerMs?: number }
        | { kind: "dailyAt"; time: string; timezone: string; staggerMs?: number }
        | { kind: "weeklyAt"; weekdays: number[]; time: string; timezone: string; staggerMs?: number };
    payload:
        | { kind: "systemEvent"; text: string }
        | { kind: "goalApprovalScan"; goalId?: string; goalIds?: string[]; allGoals?: boolean; autoEscalate?: boolean };
    sessionTarget?: "main" | "isolated";
    delivery?: { mode: "user" | "none"; bestEffort?: boolean };
    failureDestination?: { mode: "user" | "none" };
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

    return withToolContract({
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
- scheduleKind: 调度类型 "at" / "every" / "dailyAt" / "weeklyAt"（必填）
- sessionTarget: 会话目标 "main" / "isolated"（可选；systemEvent 默认 main，goalApprovalScan 默认 isolated）
- deliveryMode: 成功后通知模式 "user" / "none"（可选，默认 user）
- failureDestinationMode: 失败后通知模式 "user" / "none"（可选，默认 none）
- at: 一次性触发时间，ISO-8601 格式（scheduleKind="at" 时必填，如 "2026-02-10T09:00:00+08:00"）
- everyMs: 重复间隔毫秒数（scheduleKind="every" 时必填，最小 60000 = 1分钟）
- time: 固定时刻，HH:mm 格式（scheduleKind="dailyAt" / "weeklyAt" 时必填）
- timezone: IANA 时区名，例如 Asia/Shanghai（scheduleKind="dailyAt" / "weeklyAt" 时必填）
- weekdays: 每周几数组，使用 1-7，1=Monday，7=Sunday（scheduleKind="weeklyAt" 时必填）
- staggerMs: 显式错峰窗口（毫秒，适用于 every / dailyAt / weeklyAt；0 表示保持精确调度）
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
                        description: "调度类型：at（一次性）、every（重复）、dailyAt（每日固定时刻）、weeklyAt（每周固定时刻）",
                        enum: ["at", "every", "dailyAt", "weeklyAt"],
                    },
                    sessionTarget: {
                        type: "string",
                        description: "会话目标：main（固定 job 会话）或 isolated（每次运行新会话）",
                        enum: ["main", "isolated"],
                    },
                    deliveryMode: {
                        type: "string",
                        description: "成功后通知模式：user 或 none",
                        enum: ["user", "none"],
                    },
                    failureDestinationMode: {
                        type: "string",
                        description: "失败后通知模式：user 或 none",
                        enum: ["user", "none"],
                    },
                    at: {
                        type: "string",
                        description: "一次性触发时间，ISO-8601 格式（scheduleKind=at 时必填）",
                    },
                    everyMs: {
                        type: "number",
                        description: "重复间隔毫秒数（scheduleKind=every 时必填，最小 60000）",
                    },
                    time: {
                        type: "string",
                        description: "固定触发时刻，HH:mm 格式（scheduleKind=dailyAt/weeklyAt 时必填）",
                    },
                    timezone: {
                        type: "string",
                        description: "IANA 时区名，例如 Asia/Shanghai（scheduleKind=dailyAt/weeklyAt 时必填）",
                    },
                    weekdays: {
                        type: "array",
                        description: "每周几数组，使用 1-7，1=Monday，7=Sunday（scheduleKind=weeklyAt 时必填）",
                        items: { type: "number" },
                    },
                    staggerMs: {
                        type: "number",
                        description: "显式错峰窗口（毫秒，适用于 every/dailyAt/weeklyAt；0 表示保持精确调度）",
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
                            const scheduleDesc = formatSchedule(j.schedule);
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
                                `   会话: ${j.sessionTarget}`,
                                `   通知: ${formatDelivery(j.delivery, j.failureDestination)}`,
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
                        const sessionTarget = readSessionTarget(args.sessionTarget, payloadKind);
                        if (!sessionTarget.ok) return makeResult(false, "", sessionTarget.error);
                        const delivery = readDeliveryModes(args);
                        if (!delivery.ok) return makeResult(false, "", delivery.error);

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
                                sessionTarget: sessionTarget.value,
                                delivery: delivery.delivery,
                                failureDestination: delivery.failureDestination,
                                deleteAfterRun: args.deleteAfterRun === true,
                            });
                            return makeResult(
                                true,
                                `✅ 已创建一次性任务 "${job.name}"\n   ID: ${job.id}\n   触发时间: ${at}\n   会话: ${job.sessionTarget}\n   通知: ${formatDelivery(job.delivery, job.failureDestination)}\n   内容: ${formatPayload(job.payload)}`
                            );
                        }

                        if (scheduleKind === "every") {
                            const everyMs =
                                typeof args.everyMs === "number" ? Math.floor(args.everyMs) : 0;
                            const staggerMs = readOptionalStaggerMs(args.staggerMs);
                            if (!staggerMs.ok) return makeResult(false, "", staggerMs.error);
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
                                schedule: {
                                    kind: "every",
                                    everyMs,
                                    anchorMs: Date.now(),
                                    ...(staggerMs.value !== undefined ? { staggerMs: staggerMs.value } : {}),
                                },
                                payload: payloadResult.payload,
                                sessionTarget: sessionTarget.value,
                                delivery: delivery.delivery,
                                failureDestination: delivery.failureDestination,
                            });
                            return makeResult(
                                true,
                                `✅ 已创建周期任务 "${job.name}"\n   ID: ${job.id}\n   间隔: 每 ${formatMs(everyMs)}\n   会话: ${job.sessionTarget}\n   通知: ${formatDelivery(job.delivery, job.failureDestination)}\n   内容: ${formatPayload(job.payload)}`
                            );
                        }

                        if (scheduleKind === "dailyAt") {
                            const timeResult = readTimeAndTimezone(args);
                            const staggerMs = readOptionalStaggerMs(args.staggerMs);
                            if (!timeResult.ok) {
                                return makeResult(false, "", timeResult.error);
                            }
                            if (!staggerMs.ok) {
                                return makeResult(false, "", staggerMs.error);
                            }
                            const payloadResult = buildPayload(args, payloadKind);
                            if (!payloadResult.ok) {
                                return makeResult(false, "", payloadResult.error);
                            }
                            const job = await store.add({
                                name: jobName,
                                schedule: {
                                    kind: "dailyAt",
                                    time: timeResult.time,
                                    timezone: timeResult.timezone,
                                    ...(staggerMs.value !== undefined ? { staggerMs: staggerMs.value } : {}),
                                },
                                payload: payloadResult.payload,
                                sessionTarget: sessionTarget.value,
                                delivery: delivery.delivery,
                                failureDestination: delivery.failureDestination,
                            });
                            return makeResult(
                                true,
                                `✅ 已创建日历任务 "${job.name}"\n   ID: ${job.id}\n   调度: 每天 ${timeResult.time} @ ${timeResult.timezone}\n   会话: ${job.sessionTarget}\n   通知: ${formatDelivery(job.delivery, job.failureDestination)}\n   内容: ${formatPayload(job.payload)}`
                            );
                        }

                        if (scheduleKind === "weeklyAt") {
                            const timeResult = readTimeAndTimezone(args);
                            const staggerMs = readOptionalStaggerMs(args.staggerMs);
                            if (!timeResult.ok) {
                                return makeResult(false, "", timeResult.error);
                            }
                            if (!staggerMs.ok) {
                                return makeResult(false, "", staggerMs.error);
                            }
                            const weekdaysResult = readWeekdays(args.weekdays);
                            if (!weekdaysResult.ok) {
                                return makeResult(false, "", weekdaysResult.error);
                            }
                            const payloadResult = buildPayload(args, payloadKind);
                            if (!payloadResult.ok) {
                                return makeResult(false, "", payloadResult.error);
                            }
                            const job = await store.add({
                                name: jobName,
                                schedule: {
                                    kind: "weeklyAt",
                                    weekdays: weekdaysResult.weekdays,
                                    time: timeResult.time,
                                    timezone: timeResult.timezone,
                                    ...(staggerMs.value !== undefined ? { staggerMs: staggerMs.value } : {}),
                                },
                                payload: payloadResult.payload,
                                sessionTarget: sessionTarget.value,
                                delivery: delivery.delivery,
                                failureDestination: delivery.failureDestination,
                            });
                            return makeResult(
                                true,
                                `✅ 已创建周历任务 "${job.name}"\n   ID: ${job.id}\n   调度: 每周 ${formatWeekdays(weekdaysResult.weekdays)} ${timeResult.time} @ ${timeResult.timezone}\n   会话: ${job.sessionTarget}\n   通知: ${formatDelivery(job.delivery, job.failureDestination)}\n   内容: ${formatPayload(job.payload)}`
                            );
                        }

                        return makeResult(
                            false,
                            "",
                            "参数错误：scheduleKind 必须为 'at'、'every'、'dailyAt' 或 'weeklyAt'"
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
    }, {
        family: "service-admin",
        isReadOnly: false,
        isConcurrencySafe: false,
        needsPermission: true,
        riskLevel: "high",
        channels: ["gateway", "web"],
        safeScopes: ["local-safe", "web-safe"],
        activityDescription: "Manage cron jobs and goal approval scan schedules",
        resultSchema: {
            kind: "text",
            description: "Cron management result text.",
        },
        outputPersistencePolicy: "external-state",
    });
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

function parseTimeOfDay(raw: string): string | null {
    const text = raw.trim();
    const match = /^(\d{2}):(\d{2})$/.exec(text);
    if (!match) return null;
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }
    return text;
}

function isValidTimeZone(timezone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
        return true;
    } catch {
        return false;
    }
}

function readTimeAndTimezone(
    args: JsonObject,
): { ok: true; time: string; timezone: string } | { ok: false; error: string } {
    const timeRaw = typeof args.time === "string" ? args.time : "";
    const timezoneRaw = typeof args.timezone === "string" ? args.timezone.trim() : "";
    const time = parseTimeOfDay(timeRaw);
    if (!time) {
        return { ok: false, error: "参数错误：time 必须为 HH:mm 格式，例如 09:00" };
    }
    if (!timezoneRaw) {
        return { ok: false, error: "参数错误：timezone 不能为空" };
    }
    if (!isValidTimeZone(timezoneRaw)) {
        return { ok: false, error: `参数错误：无法识别时区 "${timezoneRaw}"` };
    }
    return { ok: true, time, timezone: timezoneRaw };
}

function readWeekdays(
    input: unknown,
): { ok: true; weekdays: number[] } | { ok: false; error: string } {
    if (!Array.isArray(input) || input.length === 0) {
        return { ok: false, error: "参数错误：weekdays 必须为非空数组，使用 1-7 表示周一到周日" };
    }
    const values: number[] = [];
    const seen = new Set<number>();
    for (const item of input) {
        if (typeof item !== "number" || !Number.isInteger(item)) {
            return { ok: false, error: "参数错误：weekdays 必须为整数数组，使用 1-7 表示周一到周日" };
        }
        if (item < 1 || item > 7) {
            return { ok: false, error: "参数错误：weekdays 只允许 1-7，1=Monday，7=Sunday" };
        }
        if (seen.has(item)) {
            return { ok: false, error: "参数错误：weekdays 不允许重复" };
        }
        seen.add(item);
        values.push(item);
    }
    values.sort((a, b) => a - b);
    return { ok: true, weekdays: values };
}

function formatWeekdays(weekdays: number[]): string {
    const labels: Record<number, string> = {
        1: "Mon",
        2: "Tue",
        3: "Wed",
        4: "Thu",
        5: "Fri",
        6: "Sat",
        7: "Sun",
    };
    return weekdays.map((weekday) => labels[weekday] ?? `#${weekday}`).join("/");
}

function formatSchedule(schedule: CronJobView["schedule"]): string {
    switch (schedule.kind) {
        case "at":
            return `一次性 @ ${schedule.at}`;
        case "every":
            return `每 ${formatMs(schedule.everyMs)} 重复${typeof schedule.staggerMs === "number" ? ` / stagger ${formatMs(schedule.staggerMs)}` : ""}`;
        case "dailyAt":
            return `每天 ${schedule.time} @ ${schedule.timezone}${typeof schedule.staggerMs === "number" ? ` / stagger ${formatMs(schedule.staggerMs)}` : ""}`;
        case "weeklyAt":
            return `每周 ${formatWeekdays(schedule.weekdays)} ${schedule.time} @ ${schedule.timezone}${typeof schedule.staggerMs === "number" ? ` / stagger ${formatMs(schedule.staggerMs)}` : ""}`;
        default:
            return `未知调度 ${JSON.stringify(schedule)}`;
    }
}

function formatDelivery(
    delivery: CronJobView["delivery"],
    failureDestination?: CronJobView["failureDestination"],
): string {
    return `success=${delivery.mode}${failureDestination ? ` / failure=${failureDestination.mode}` : ""}`;
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

function readOptionalStaggerMs(
    input: unknown,
): { ok: true; value?: number } | { ok: false; error: string } {
    if (input === undefined) return { ok: true };
    if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
        return { ok: false, error: "参数错误：staggerMs 必须为大于等于 0 的数字" };
    }
    return { ok: true, value: Math.floor(input) };
}

function readSessionTarget(
    input: unknown,
    payloadKind: string,
): { ok: true; value: "main" | "isolated" } | { ok: false; error: string } {
    const normalized = typeof input === "string" ? input.trim().toLowerCase() : "";
    if (!normalized) {
        return { ok: true, value: payloadKind === "goalApprovalScan" ? "isolated" : "main" };
    }
    if (normalized !== "main" && normalized !== "isolated") {
        return { ok: false, error: "参数错误：sessionTarget 只允许 main 或 isolated" };
    }
    if (normalized === "main" && payloadKind === "goalApprovalScan") {
        return { ok: false, error: "参数错误：goalApprovalScan 当前只支持 sessionTarget=isolated" };
    }
    return { ok: true, value: normalized };
}

function readDeliveryModes(
    args: JsonObject,
): { ok: true; delivery: { mode: "user" | "none" }; failureDestination?: { mode: "user" | "none" } } | { ok: false; error: string } {
    const deliveryMode = typeof args.deliveryMode === "string" ? args.deliveryMode.trim().toLowerCase() : "user";
    if (deliveryMode !== "user" && deliveryMode !== "none") {
        return { ok: false, error: "参数错误：deliveryMode 只允许 user 或 none" };
    }
    const failureMode = typeof args.failureDestinationMode === "string"
        ? args.failureDestinationMode.trim().toLowerCase()
        : "";
    if (failureMode && failureMode !== "user" && failureMode !== "none") {
        return { ok: false, error: "参数错误：failureDestinationMode 只允许 user 或 none" };
    }
    return {
        ok: true,
        delivery: { mode: deliveryMode as "user" | "none" },
        ...(failureMode ? { failureDestination: { mode: failureMode as "user" | "none" } } : {}),
    };
}
