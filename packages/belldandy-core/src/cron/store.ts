/**
 * Cron Store - JSON 文件持久化
 *
 * 将定时任务列表存储在 ~/.star_sanctuary/cron-jobs.json 中
 * 支持 CRUD 操作，写入时使用临时文件 + rename 保证原子性
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { CronJob, CronJobCreate, CronJobPatch, CronStoreFile } from "./types.js";

const STORE_FILENAME = "cron-jobs.json";

export class CronStore {
    private readonly filePath: string;

    constructor(stateDir: string) {
        this.filePath = path.join(stateDir, STORE_FILENAME);
    }

    // ── 读取 ──

    /** 加载所有任务 */
    async list(): Promise<CronJob[]> {
        const data = await this.load();
        return data.jobs;
    }

    /** 获取单个任务 */
    async get(id: string): Promise<CronJob | undefined> {
        const jobs = await this.list();
        return jobs.find((j) => j.id === id);
    }

    // ── 写入 ──

    /** 创建新任务，返回完整 Job 对象 */
    async add(input: CronJobCreate): Promise<CronJob> {
        const data = await this.load();
        const now = Date.now();

        const job: CronJob = {
            id: crypto.randomUUID(),
            name: input.name,
            description: input.description,
            enabled: input.enabled ?? true,
            deleteAfterRun: input.deleteAfterRun,
            createdAtMs: now,
            updatedAtMs: now,
            schedule: input.schedule,
            payload: input.payload,
            state: {
                nextRunAtMs: computeNextRun(input.schedule, now),
            },
        };

        data.jobs.push(job);
        await this.save(data);
        return job;
    }

    /** 更新任务，返回更新后的 Job 或 undefined（未找到） */
    async update(id: string, patch: CronJobPatch): Promise<CronJob | undefined> {
        const data = await this.load();
        const index = data.jobs.findIndex((j) => j.id === id);
        if (index === -1) return undefined;

        const job = data.jobs[index];
        const now = Date.now();

        // 应用 patch（只覆盖非 undefined 字段）
        if (patch.name !== undefined) job.name = patch.name;
        if (patch.description !== undefined) job.description = patch.description;
        if (patch.enabled !== undefined) job.enabled = patch.enabled;
        if (patch.deleteAfterRun !== undefined) job.deleteAfterRun = patch.deleteAfterRun;
        if (patch.schedule !== undefined) {
            job.schedule = patch.schedule;
            // 调度变更时重新计算下次执行时间
            job.state.nextRunAtMs = computeNextRun(patch.schedule, now);
        }
        if (patch.payload !== undefined) job.payload = patch.payload;
        job.updatedAtMs = now;

        data.jobs[index] = job;
        await this.save(data);
        return job;
    }

    /** 删除任务，返回是否成功 */
    async remove(id: string): Promise<boolean> {
        const data = await this.load();
        const before = data.jobs.length;
        data.jobs = data.jobs.filter((j) => j.id !== id);
        if (data.jobs.length === before) return false;
        await this.save(data);
        return true;
    }

    /** 批量更新状态（调度器 tick 后调用） */
    async saveJobs(jobs: CronJob[]): Promise<void> {
        await this.save({ version: 1, jobs });
    }

    // ── 内部方法 ──

    private async load(): Promise<CronStoreFile> {
        try {
            const content = await fs.readFile(this.filePath, "utf-8");
            const parsed = JSON.parse(content) as CronStoreFile;
            // 基本校验
            if (parsed.version === 1 && Array.isArray(parsed.jobs)) {
                return parsed;
            }
        } catch {
            // 文件不存在或格式错误，返回空列表
        }
        return { version: 1, jobs: [] };
    }

    private async save(data: CronStoreFile): Promise<void> {
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
        // 原子写入：先写临时文件再 rename
        const tmpPath = `${this.filePath}.tmp`;
        await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
        await fs.rename(tmpPath, this.filePath);
    }
}

// ── 调度计算 ──

/** 计算下次执行时间 */
export function computeNextRun(schedule: CronJob["schedule"], nowMs: number): number | undefined {
    if (schedule.kind === "at") {
        const atMs = new Date(schedule.at).getTime();
        if (!Number.isFinite(atMs)) return undefined;
        // 如果目标时间已过，仍返回（scheduler 会执行一次后 disable）
        return atMs > nowMs ? atMs : nowMs;
    }

    if (schedule.kind === "every") {
        const everyMs = Math.max(60_000, Math.floor(schedule.everyMs)); // 最小 1 分钟
        const anchor = Math.max(0, Math.floor(schedule.anchorMs ?? nowMs));
        if (nowMs < anchor) return anchor;
        const elapsed = nowMs - anchor;
        const steps = Math.ceil(elapsed / everyMs);
        return anchor + steps * everyMs;
    }

    // 未来扩展 cron 表达式时在此添加
    return undefined;
}
