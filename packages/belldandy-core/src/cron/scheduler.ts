/**
 * Cron Scheduler - 定时任务调度引擎
 *
 * 每 TICK_INTERVAL_MS（30s）轮询检查所有 enabled 的 job，
 * 如果 nextRunAtMs ≤ now 则执行该任务。
 *
 * 支持：
 * - 活跃时段过滤（复用 Heartbeat 逻辑）
 * - 忙碌检测（防止插队）
 * - at 类型执行后自动 disable 或删除
 * - every 类型自动计算下次触发时间
 */

import type { CronGoalApprovalScanPayload, CronJob } from "./types.js";
import { CronStore, computeNextRunForJob } from "./store.js";

/** 调度器轮询间隔：30 秒 */
const TICK_INTERVAL_MS = 30_000;

/** 最大并发执行数（防止 tick 堆积） */
const MAX_CONCURRENT_RUNS = 3;

export interface CronSchedulerOptions {
    /** CronStore 实例 */
    store: CronStore;
    /** 发送消息到 Agent 并获取回复 */
    sendMessage?: (job: CronJob, prompt: string) => Promise<string | { text: string; conversationId?: string }>;
    /** 直接执行 goal approval scan */
    runGoalApprovalScan?: (payload: CronGoalApprovalScanPayload) => Promise<CronGoalApprovalScanResult>;
    /** 推送消息到用户渠道 */
    deliverToUser?: (message: string) => Promise<void>;
    /** 系统是否忙碌 */
    isBusy?: () => boolean;
    /** 活跃时段（如 { start: "08:00", end: "23:00" }） */
    activeHours?: { start: string; end: string };
    /** 用户时区 */
    timezone?: string;
    /** 日志函数 */
    log?: (message: string) => void;
    /** 运行态事件（用于统一 background continuation ledger） */
    onExecutionEvent?: (event: CronExecutionEvent) => void | Promise<void>;
}

export interface CronSchedulerHandle {
    /** 停止调度器 */
    stop: () => void;
    /** 获取当前状态 */
    status: () => CronSchedulerStatus;
}

export interface CronSchedulerStatus {
    running: boolean;
    totalJobs: number;
    enabledJobs: number;
    activeRuns: number;
    lastTickAtMs?: number;
}

export interface CronGoalApprovalScanResult {
    /** 执行摘要，用于日志与状态观测 */
    summary: string;
    /** 可选用户通知文案；为空时仅记录运行态，不主动通知 */
    notifyMessage?: string;
}

export type CronExecutionEvent =
    | {
        phase: "started";
        runId: string;
        jobId: string;
        jobName: string;
        payloadKind: CronJob["payload"]["kind"];
        sessionTarget: CronJob["sessionTarget"];
        conversationId?: string;
        startedAt: number;
      }
    | {
        phase: "finished";
        runId: string;
        jobId: string;
        jobName: string;
        payloadKind: CronJob["payload"]["kind"];
        sessionTarget: CronJob["sessionTarget"];
        conversationId?: string;
        startedAt: number;
        finishedAt: number;
        status: "ok" | "error" | "skipped";
        summary?: string;
        reason?: string;
        nextRunAtMs?: number;
      };

function normalizeSendMessageResult(
    result: string | { text: string; conversationId?: string },
): { text: string; conversationId?: string } {
    if (typeof result === "string") {
        return { text: result };
    }
    return {
        text: typeof result?.text === "string" ? result.text : "",
        conversationId: typeof result?.conversationId === "string" ? result.conversationId.trim() || undefined : undefined,
    };
}

export function startCronScheduler(options: CronSchedulerOptions): CronSchedulerHandle {
    const {
        store,
        sendMessage,
        runGoalApprovalScan,
        deliverToUser,
        isBusy,
        activeHours,
        timezone,
        log = console.log,
        onExecutionEvent,
    } = options;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let activeRuns = 0;
    let lastTickAtMs: number | undefined;
    let tickInFlight = false;

    const markJobsSkipped = async (jobs: CronJob[], now: number, reason: string): Promise<boolean> => {
        let changed = false;
        for (const job of jobs) {
            if (job.state.lastStatus === "skipped" && job.state.lastError === reason) {
                continue;
            }
            job.state.lastRunAtMs = now;
            job.state.lastDurationMs = 0;
            job.state.lastStatus = "skipped";
            job.state.lastError = reason;
            await onExecutionEvent?.({
                phase: "finished",
                runId: `cron-skip-${job.id}-${now}`,
                jobId: job.id,
                jobName: job.name,
                payloadKind: job.payload.kind,
                sessionTarget: job.sessionTarget,
                startedAt: now,
                finishedAt: now,
                status: "skipped",
                reason,
                nextRunAtMs: job.state.nextRunAtMs,
            });
            changed = true;
        }
        return changed;
    };

    // 活跃时段检查（复用 Heartbeat 的逻辑）
    const isWithinActiveHours = (now: number): boolean => {
        if (!activeHours) return true;

        const parseTime = (time: string): number | null => {
            const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
            if (!match) return null;
            const h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            if (h < 0 || h > 24 || m < 0 || m > 59) return null;
            if (h === 24 && m === 0) return 24 * 60;
            if (h === 24) return null;
            return h * 60 + m;
        };

        const startMin = parseTime(activeHours.start);
        const endMin = parseTime(activeHours.end);
        if (startMin === null || endMin === null) return true;

        let currentMin: number;
        try {
            const tz = timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: tz,
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            }).formatToParts(new Date(now));
            const map: Record<string, string> = {};
            for (const part of parts) {
                if (part.type !== "literal") map[part.type] = part.value;
            }
            currentMin = Number(map.hour) * 60 + Number(map.minute);
        } catch {
            const d = new Date(now);
            currentMin = d.getHours() * 60 + d.getMinutes();
        }

        if (endMin > startMin) {
            return currentMin >= startMin && currentMin < endMin;
        }
        // 跨午夜
        return currentMin >= startMin || currentMin < endMin;
    };

    // 执行单个 job
    const executeJob = async (job: CronJob, jobs: CronJob[]): Promise<void> => {
        const startedAt = Date.now();
        const runId = `cron-run-${job.id}-${startedAt}`;
        let completionEvent: Omit<Extract<CronExecutionEvent, { phase: "finished" }>, "nextRunAtMs"> | undefined;
        log(`[cron] 执行任务 "${job.name}" (${job.id})`);
        await onExecutionEvent?.({
            phase: "started",
            runId,
            jobId: job.id,
            jobName: job.name,
            payloadKind: job.payload.kind,
            sessionTarget: job.sessionTarget,
            startedAt,
        });

        try {
            let summary = "";
            let notifyMessage: string | undefined;
            let conversationId: string | undefined;
            if (job.payload.kind === "systemEvent") {
                if (!sendMessage) {
                    throw new Error("Cron systemEvent executor is not available.");
                }
                const response = normalizeSendMessageResult(await sendMessage(job, job.payload.text));
                summary = response.text?.trim() || "systemEvent completed";
                notifyMessage = response.text?.trim() || undefined;
                conversationId = response.conversationId;
            } else if (job.payload.kind === "goalApprovalScan") {
                if (!runGoalApprovalScan) {
                    throw new Error("Cron goalApprovalScan executor is not available.");
                }
                const result = await runGoalApprovalScan(job.payload);
                summary = result.summary.trim();
                notifyMessage = result.notifyMessage?.trim() || undefined;
            }

            job.state.lastRunAtMs = Date.now();
            job.state.lastDurationMs = Date.now() - startedAt;
            job.state.lastStatus = "ok";
            job.state.lastError = undefined;

            if (notifyMessage && deliverToUser && job.delivery.mode !== "none") {
                try {
                    await deliverToUser(`🕐 [Cron: ${job.name}] ${notifyMessage}`);
                    log(`[cron] 任务 "${job.name}" 完成并已投递 (${job.state.lastDurationMs}ms) | ${summary}`);
                } catch (deliverErr) {
                    const msg = deliverErr instanceof Error ? deliverErr.message : String(deliverErr);
                    log(`[cron] 任务 "${job.name}" 投递失败: ${msg}`);
                }
            } else {
                log(`[cron] 任务 "${job.name}" 完成 (${job.state.lastDurationMs}ms) | ${summary}`);
            }
            completionEvent = {
                phase: "finished",
                runId,
                jobId: job.id,
                jobName: job.name,
                payloadKind: job.payload.kind,
                sessionTarget: job.sessionTarget,
                conversationId,
                startedAt,
                finishedAt: Date.now(),
                status: "ok",
                summary,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            job.state.lastRunAtMs = Date.now();
            job.state.lastDurationMs = Date.now() - startedAt;
            job.state.lastStatus = "error";
            job.state.lastError = message;
            log(`[cron] 任务 "${job.name}" 执行失败: ${message}`);
            completionEvent = {
                phase: "finished",
                runId,
                jobId: job.id,
                jobName: job.name,
                payloadKind: job.payload.kind,
                sessionTarget: job.sessionTarget,
                startedAt,
                finishedAt: Date.now(),
                status: "error",
                reason: message,
            };
            if (deliverToUser && job.failureDestination?.mode === "user") {
                try {
                    await deliverToUser(`⚠️ [Cron: ${job.name}] 执行失败：${message}`);
                } catch (deliverErr) {
                    const deliverMessage = deliverErr instanceof Error ? deliverErr.message : String(deliverErr);
                    log(`[cron] 任务 "${job.name}" 失败通知投递失败: ${deliverMessage}`);
                }
            }
        }

        // 后处理：at 类型执行后处理
        if (job.schedule.kind === "at") {
            if (job.deleteAfterRun) {
                // 从列表中移除
                const idx = jobs.indexOf(job);
                if (idx !== -1) jobs.splice(idx, 1);
                log(`[cron] 一次性任务 "${job.name}" 已删除`);
            } else {
                job.enabled = false;
                job.state.nextRunAtMs = undefined;
                log(`[cron] 一次性任务 "${job.name}" 已禁用`);
            }
        } else {
            job.state.nextRunAtMs = computeNextRunForJob(job, Date.now());
        }
        if (completionEvent) {
            await onExecutionEvent?.({
                ...completionEvent,
                nextRunAtMs: job.state.nextRunAtMs,
            });
        }
    };

    // 调度 tick
    const tick = async (): Promise<void> => {
        if (stopped) return;
        if (tickInFlight) return;
        tickInFlight = true;

        try {
            const now = Date.now();
            lastTickAtMs = now;

            // 加载任务列表
            let jobs: CronJob[];
            try {
                jobs = await store.list();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log(`[cron] 加载任务失败: ${msg}`);
                return;
            }

            if (jobs.length === 0) return;

            // 筛选需要执行的任务
            const dueJobs = jobs.filter(
                (j) => j.enabled && j.state.nextRunAtMs !== undefined && j.state.nextRunAtMs <= now
            );

            if (dueJobs.length === 0) return;

            // 活跃时段检查
            if (!isWithinActiveHours(now)) {
                const changed = await markJobsSkipped(dueJobs, now, "Skipped: outside active hours.");
                if (changed) {
                    await store.saveJobs(jobs);
                }
                return;
            }

            // 忙碌检查
            if (isBusy?.()) {
                const changed = await markJobsSkipped(dueJobs, now, "Skipped: scheduler is busy.");
                if (changed) {
                    await store.saveJobs(jobs);
                }
                return;
            }

            // 限制并发
            const toRun = dueJobs.slice(0, MAX_CONCURRENT_RUNS - activeRuns);
            if (toRun.length === 0) return;

            // 顺序执行（避免 Agent 并发问题）
            for (const job of toRun) {
                if (stopped) break;
                activeRuns++;
                try {
                    await executeJob(job, jobs);
                } finally {
                    activeRuns--;
                }
            }

            // 持久化状态
            try {
                await store.saveJobs(jobs);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log(`[cron] 保存状态失败: ${msg}`);
            }
        } finally {
            tickInFlight = false;
        }
    };

    // 启动调度
    log(`[cron] scheduler started, tick interval: ${TICK_INTERVAL_MS / 1000}s`);
    timer = setInterval(() => {
        if (!stopped) {
            tick().catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                log(`[cron] tick error: ${msg}`);
            });
        }
    }, TICK_INTERVAL_MS);

    return {
        stop: () => {
            stopped = true;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            log("[cron] scheduler stopped");
        },
        status: () => {
            // 同步获取状态（异步读 store 会阻塞，这里返回缓存值）
            return {
                running: !stopped,
                totalJobs: -1, // 需要异步读取，这里用 -1 表示未知
                enabledJobs: -1,
                activeRuns,
                lastTickAtMs,
            };
        },
    };
}
