/**
 * Cron 定时任务系统 - 类型定义
 *
 * 支持两种调度类型：
 * - at：一次性定时（ISO 时间戳）
 * - every：周期性重复（间隔毫秒）
 * - dailyAt：按时区的每日固定时刻
 * - weeklyAt：按时区的每周固定 weekday + 时刻
 *
 * 未来可扩展 cron 表达式（方案 C）
 */

// ── 调度类型 ──

/** 一次性调度：在指定时间点触发一次 */
export type CronScheduleAt = {
    kind: "at";
    /** ISO-8601 时间戳（如 "2026-02-10T09:00:00+08:00"） */
    at: string;
};

/** 周期性调度：每隔 everyMs 毫秒触发 */
export type CronScheduleEvery = {
    kind: "every";
    /** 间隔毫秒（最小 60_000 = 1 分钟） */
    everyMs: number;
    /** 锚定时间戳（可选，默认为创建时间） */
    anchorMs?: number;
};

/** 日历调度：按指定时区每天 HH:mm 触发 */
export type CronScheduleDailyAt = {
    kind: "dailyAt";
    /** HH:mm，24 小时制，必须补零 */
    time: string;
    /** IANA 时区名，例如 Asia/Shanghai */
    timezone: string;
};

/** 日历调度：按指定时区的周几 + HH:mm 触发 */
export type CronScheduleWeeklyAt = {
    kind: "weeklyAt";
    /** 1-7，1=Monday，7=Sunday */
    weekdays: number[];
    /** HH:mm，24 小时制，必须补零 */
    time: string;
    /** IANA 时区名，例如 Asia/Shanghai */
    timezone: string;
};

export type CronSchedule =
    | CronScheduleAt
    | CronScheduleEvery
    | CronScheduleDailyAt
    | CronScheduleWeeklyAt;

// ── Payload ──

/** 系统事件：注入文本到 Agent 主会话 */
export type CronSystemEventPayload = {
    kind: "systemEvent";
    /** 发送给 Agent 的提示文本 */
    text: string;
};

/** Goal 审批扫描：直接驱动 approval workflow scan，而不是走自然语言 prompt */
export type CronGoalApprovalScanPayload = {
    kind: "goalApprovalScan";
    /** 单个 goal 扫描目标 */
    goalId?: string;
    /** 多个 goal 扫描目标 */
    goalIds?: string[];
    /** 是否扫描所有 goal */
    allGoals?: boolean;
    /** 是否自动升级超时 stage；默认由执行器决定 */
    autoEscalate?: boolean;
};

export type CronPayload = CronSystemEventPayload | CronGoalApprovalScanPayload;

// ── Job 状态 ──

export type CronJobStatus = "ok" | "error" | "skipped";

export type CronJobState = {
    /** 下次计划执行时间 */
    nextRunAtMs?: number;
    /** 上次执行时间 */
    lastRunAtMs?: number;
    /** 上次执行状态 */
    lastStatus?: CronJobStatus;
    /** 上次错误信息 */
    lastError?: string;
    /** 上次执行耗时 */
    lastDurationMs?: number;
};

// ── Job 定义 ──

export type CronJob = {
    /** 唯一 ID（UUID） */
    id: string;
    /** 任务名称（用户可读） */
    name: string;
    /** 任务描述（可选） */
    description?: string;
    /** 是否启用 */
    enabled: boolean;
    /** 执行后是否自动删除（适用于 at 类型） */
    deleteAfterRun?: boolean;
    /** 创建时间 */
    createdAtMs: number;
    /** 最后更新时间 */
    updatedAtMs: number;
    /** 调度配置 */
    schedule: CronSchedule;
    /** 执行内容 */
    payload: CronPayload;
    /** 运行时状态 */
    state: CronJobState;
};

// ── CRUD 操作类型 ──

/** 创建任务所需字段 */
export type CronJobCreate = {
    name: string;
    description?: string;
    schedule: CronSchedule;
    payload: CronPayload;
    enabled?: boolean;
    deleteAfterRun?: boolean;
};

/** 更新任务所需字段（全部可选） */
export type CronJobPatch = {
    name?: string;
    description?: string;
    enabled?: boolean;
    deleteAfterRun?: boolean;
    schedule?: CronSchedule;
    payload?: CronPayload;
};

// ── 持久化格式 ──

export type CronStoreFile = {
    version: 1;
    jobs: CronJob[];
};
