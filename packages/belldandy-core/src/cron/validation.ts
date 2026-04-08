import type {
    CronDelivery,
    CronFailureDestination,
    CronJob,
    CronJobCreate,
    CronJobPatch,
    CronPayload,
    CronSchedule,
    CronSessionTarget,
} from "./types.js";

const MINUTE_MS = 60_000;
const STAGGER_TARGETS = new Set(["every", "dailyAt", "weeklyAt"]);

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

export function normalizeCronStaggerMs(value: unknown): number | undefined {
    const numeric =
        typeof value === "number"
            ? value
            : typeof value === "string" && value.trim()
                ? Number(value)
                : Number.NaN;
    if (!Number.isFinite(numeric)) return undefined;
    return Math.max(0, Math.floor(numeric));
}

function validateTimeOfDay(value: string): boolean {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function validateTimeZone(value: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
        return true;
    } catch {
        return false;
    }
}

function normalizeWeekdays(input: unknown): number[] {
    if (!Array.isArray(input) || input.length === 0) {
        throw new Error("cron weeklyAt schedule requires non-empty weekdays");
    }
    const seen = new Set<number>();
    for (const item of input) {
        if (!Number.isInteger(item) || item < 1 || item > 7 || seen.has(item)) {
            throw new Error("cron weeklyAt schedule weekdays must be unique integers between 1 and 7");
        }
        seen.add(item);
    }
    return Array.from(seen).sort((a, b) => a - b);
}

function normalizeSchedule(schedule: CronSchedule): CronSchedule {
    if (schedule.kind === "at") {
        const at = normalizeString(schedule.at);
        const atMs = new Date(at).getTime();
        if (!at || !Number.isFinite(atMs)) {
            throw new Error('cron at schedule requires a valid ISO-8601 "at" timestamp');
        }
        return { kind: "at", at };
    }

    if (schedule.kind === "every") {
        const everyMs = Math.floor(Number(schedule.everyMs));
        if (!Number.isFinite(everyMs) || everyMs < MINUTE_MS) {
            throw new Error("cron every schedule requires everyMs >= 60000");
        }
        const staggerMs = normalizeCronStaggerMs(schedule.staggerMs);
        return {
            kind: "every",
            everyMs,
            ...(typeof schedule.anchorMs === "number" && Number.isFinite(schedule.anchorMs)
                ? { anchorMs: Math.max(0, Math.floor(schedule.anchorMs)) }
                : {}),
            ...(staggerMs !== undefined ? { staggerMs } : {}),
        };
    }

    if (schedule.kind === "dailyAt") {
        const time = normalizeString(schedule.time);
        const timezone = normalizeString(schedule.timezone);
        if (!validateTimeOfDay(time)) {
            throw new Error('cron dailyAt schedule requires "time" in HH:mm format');
        }
        if (!timezone || !validateTimeZone(timezone)) {
            throw new Error('cron dailyAt schedule requires a valid IANA "timezone"');
        }
        const staggerMs = normalizeCronStaggerMs(schedule.staggerMs);
        return {
            kind: "dailyAt",
            time,
            timezone,
            ...(staggerMs !== undefined ? { staggerMs } : {}),
        };
    }

    if (schedule.kind === "weeklyAt") {
        const time = normalizeString(schedule.time);
        const timezone = normalizeString(schedule.timezone);
        if (!validateTimeOfDay(time)) {
            throw new Error('cron weeklyAt schedule requires "time" in HH:mm format');
        }
        if (!timezone || !validateTimeZone(timezone)) {
            throw new Error('cron weeklyAt schedule requires a valid IANA "timezone"');
        }
        const staggerMs = normalizeCronStaggerMs(schedule.staggerMs);
        return {
            kind: "weeklyAt",
            weekdays: normalizeWeekdays(schedule.weekdays),
            time,
            timezone,
            ...(staggerMs !== undefined ? { staggerMs } : {}),
        };
    }

    return schedule;
}

function normalizePayload(payload: CronPayload): CronPayload {
    if (payload.kind === "systemEvent") {
        const text = normalizeString(payload.text);
        if (!text) {
            throw new Error('cron systemEvent payload requires non-empty "text"');
        }
        return { kind: "systemEvent", text };
    }

    const goalId = normalizeString(payload.goalId);
    const goalIds = Array.isArray(payload.goalIds)
        ? payload.goalIds.map((item) => normalizeString(item)).filter(Boolean)
        : [];
    const allGoals = payload.allGoals === true;
    if (!goalId && goalIds.length === 0 && !allGoals) {
        throw new Error("cron goalApprovalScan payload requires goalId, goalIds, or allGoals=true");
    }
    return {
        kind: "goalApprovalScan",
        ...(goalId ? { goalId } : {}),
        ...(goalIds.length ? { goalIds: Array.from(new Set(goalIds)) } : {}),
        ...(allGoals ? { allGoals: true } : {}),
        autoEscalate: payload.autoEscalate !== false,
    };
}

function resolveDefaultSessionTarget(payload: CronPayload): CronSessionTarget {
    return payload.kind === "systemEvent" ? "main" : "isolated";
}

function normalizeSessionTarget(value: unknown, payload: CronPayload): CronSessionTarget {
    const normalized = normalizeString(value).toLowerCase();
    if (!normalized) return resolveDefaultSessionTarget(payload);
    if (normalized === "main" || normalized === "isolated") {
        if (normalized === "main" && payload.kind !== "systemEvent") {
            throw new Error('cron sessionTarget "main" is only supported for payload.kind="systemEvent"');
        }
        return normalized;
    }
    throw new Error('cron sessionTarget must be "main" or "isolated"');
}

function normalizeDelivery(value: unknown): CronDelivery {
    const mode = normalizeString((value as { mode?: unknown } | undefined)?.mode).toLowerCase();
    if (!mode) return { mode: "user" };
    if (mode !== "user" && mode !== "none") {
        throw new Error('cron delivery.mode must be "user" or "none"');
    }
    return {
        mode: mode as CronDelivery["mode"],
        ...(typeof (value as { bestEffort?: unknown } | undefined)?.bestEffort === "boolean"
            ? { bestEffort: (value as { bestEffort: boolean }).bestEffort }
            : {}),
    };
}

function normalizeFailureDestination(value: unknown): CronFailureDestination | undefined {
    if (value === undefined || value === null) return undefined;
    const mode = normalizeString((value as { mode?: unknown }).mode).toLowerCase();
    if (!mode || mode === "none") return { mode: "none" };
    if (mode !== "user") {
        throw new Error('cron failureDestination.mode must be "user" or "none"');
    }
    return { mode: "user" };
}

function pruneUnsupportedStagger(schedule: CronSchedule): CronSchedule {
    if (schedule.kind === "at") {
        return schedule;
    }
    if (!STAGGER_TARGETS.has(schedule.kind)) {
        return schedule;
    }
    return schedule;
}

export function normalizeCronJobCreateInput(input: CronJobCreate): CronJobCreate {
    const payload = normalizePayload(input.payload);
    const schedule = pruneUnsupportedStagger(normalizeSchedule(input.schedule));
    return {
        name: normalizeRequiredName(input.name),
        ...(normalizeString(input.description) ? { description: normalizeString(input.description) } : {}),
        schedule,
        payload,
        sessionTarget: normalizeSessionTarget(input.sessionTarget, payload),
        delivery: normalizeDelivery(input.delivery),
        ...(normalizeFailureDestination(input.failureDestination) ? { failureDestination: normalizeFailureDestination(input.failureDestination) } : {}),
        enabled: normalizeBoolean(input.enabled, true),
        ...(typeof input.deleteAfterRun === "boolean" ? { deleteAfterRun: input.deleteAfterRun } : {}),
    };
}

export function normalizeCronJobPatchInput(patch: CronJobPatch, current?: CronJob): CronJobPatch {
    const next: CronJobPatch = {};
    if ("name" in patch) {
        next.name = normalizeRequiredName(patch.name ?? "");
    }
    if ("description" in patch) {
        const description = normalizeString(patch.description);
        next.description = description || undefined;
    }
    if ("enabled" in patch && typeof patch.enabled === "boolean") {
        next.enabled = patch.enabled;
    }
    if ("deleteAfterRun" in patch && typeof patch.deleteAfterRun === "boolean") {
        next.deleteAfterRun = patch.deleteAfterRun;
    }
    const payload = patch.payload ? normalizePayload(patch.payload) : current?.payload;
    if ("payload" in patch && patch.payload) {
        next.payload = payload;
    }
    if ("schedule" in patch && patch.schedule) {
        next.schedule = pruneUnsupportedStagger(normalizeSchedule(patch.schedule));
    }
    if ("sessionTarget" in patch) {
        if (!payload) {
            throw new Error("cron patch requires payload context before changing sessionTarget");
        }
        next.sessionTarget = normalizeSessionTarget(patch.sessionTarget, payload);
    }
    if ("delivery" in patch) {
        next.delivery = normalizeDelivery(patch.delivery);
    }
    if ("failureDestination" in patch) {
        next.failureDestination = normalizeFailureDestination(patch.failureDestination);
    }
    return next;
}

export function applyCronJobRuntimeDefaults(job: CronJob): CronJob {
    const payload = job.payload.kind === "systemEvent"
        ? { kind: "systemEvent", text: normalizeString(job.payload.text) || job.payload.text } as CronPayload
        : {
            kind: "goalApprovalScan",
            ...(normalizeString(job.payload.goalId) ? { goalId: normalizeString(job.payload.goalId) } : {}),
            ...(Array.isArray(job.payload.goalIds)
                ? { goalIds: job.payload.goalIds.map((item) => normalizeString(item)).filter(Boolean) }
                : {}),
            ...(job.payload.allGoals ? { allGoals: true } : {}),
            autoEscalate: job.payload.autoEscalate !== false,
        } as CronPayload;
    const sessionTarget = normalizeString(job.sessionTarget).toLowerCase();
    const delivery = normalizeDelivery(job.delivery);
    const failureDestination = normalizeFailureDestination(job.failureDestination);
    const schedule = job.schedule.kind === "at" ? job.schedule : pruneUnsupportedStagger({
        ...job.schedule,
        ...(normalizeCronStaggerMs((job.schedule as { staggerMs?: unknown }).staggerMs) !== undefined
            ? { staggerMs: normalizeCronStaggerMs((job.schedule as { staggerMs?: unknown }).staggerMs) }
            : {}),
    } as CronSchedule);
    return {
        ...job,
        schedule,
        payload,
        sessionTarget:
            sessionTarget === "main" || sessionTarget === "isolated"
                ? sessionTarget
                : resolveDefaultSessionTarget(payload),
        delivery,
        ...(failureDestination ? { failureDestination } : {}),
    };
}

function normalizeRequiredName(value: unknown): string {
    const name = normalizeString(value);
    if (!name) {
        throw new Error("cron job name cannot be empty");
    }
    return name;
}
