import type { CronJob } from "./types.js";

type CronStoreReader = {
  list(): Promise<CronJob[]>;
};

type CronSchedulerStatusReader = {
  status(): {
    running: boolean;
    activeRuns: number;
    lastTickAtMs?: number;
  };
};

export type CronRuntimeDoctorJobSummary = {
  id: string;
  name: string;
  enabled: boolean;
  scheduleSummary: string;
  sessionTarget: "main" | "isolated";
  deliveryMode: "user" | "none";
  failureDestinationMode: "user" | "none";
  staggerMs?: number;
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: string;
};

export type CronRuntimeDoctorReport = {
  scheduler: {
    enabled: boolean;
    running: boolean;
    activeRuns: number;
    lastTickAtMs?: number;
  };
  totals: {
    totalJobs: number;
    enabledJobs: number;
    disabledJobs: number;
    staggeredJobs: number;
    invalidNextRunJobs: number;
  };
  sessionTargetCounts: {
    main: number;
    isolated: number;
  };
  deliveryModeCounts: {
    user: number;
    none: number;
  };
  failureDestinationModeCounts: {
    user: number;
    none: number;
  };
  recentJobs: CronRuntimeDoctorJobSummary[];
  headline: string;
};

function getCronStaggerMs(job: CronJob): number | undefined {
  if (job.schedule.kind === "at") {
    return undefined;
  }
  const staggerMs = job.schedule.staggerMs;
  return typeof staggerMs === "number" && Number.isFinite(staggerMs) && staggerMs > 0
    ? Math.floor(staggerMs)
    : undefined;
}

function formatCronSchedule(job: CronJob): string {
  switch (job.schedule.kind) {
    case "at":
      return `at ${job.schedule.at}`;
    case "every":
      return `every ${job.schedule.everyMs}ms`;
    case "dailyAt":
      return `daily ${job.schedule.time} @ ${job.schedule.timezone}`;
    case "weeklyAt":
      return `weekly [${job.schedule.weekdays.join(",")}] ${job.schedule.time} @ ${job.schedule.timezone}`;
    default:
      return "unknown";
  }
}

function summarizeCronJobs(jobs: CronJob[], limit: number): CronRuntimeDoctorJobSummary[] {
  const sorted = [...jobs].sort((left, right) => {
    const leftEnabled = left.enabled ? 1 : 0;
    const rightEnabled = right.enabled ? 1 : 0;
    if (leftEnabled !== rightEnabled) {
      return rightEnabled - leftEnabled;
    }
    const leftNextRun = left.state.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
    const rightNextRun = right.state.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
    if (leftNextRun !== rightNextRun) {
      return leftNextRun - rightNextRun;
    }
    return (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0);
  });

  return sorted.slice(0, Math.max(1, limit)).map((job) => ({
    id: job.id,
    name: job.name,
    enabled: job.enabled,
    scheduleSummary: formatCronSchedule(job),
    sessionTarget: job.sessionTarget,
    deliveryMode: job.delivery.mode,
    failureDestinationMode: job.failureDestination?.mode ?? "none",
    ...(getCronStaggerMs(job) !== undefined ? { staggerMs: getCronStaggerMs(job) } : {}),
    ...(typeof job.state.nextRunAtMs === "number" ? { nextRunAtMs: job.state.nextRunAtMs } : {}),
    ...(typeof job.state.lastRunAtMs === "number" ? { lastRunAtMs: job.state.lastRunAtMs } : {}),
    ...(job.state.lastStatus ? { lastStatus: job.state.lastStatus } : {}),
  }));
}

export async function buildCronRuntimeDoctorReport(input: {
  enabled: boolean;
  store: CronStoreReader;
  scheduler?: CronSchedulerStatusReader;
  recentJobLimit?: number;
}): Promise<CronRuntimeDoctorReport> {
  const jobs = await input.store.list();
  const schedulerStatus = input.scheduler?.status();

  const enabledJobs = jobs.filter((job) => job.enabled).length;
  const disabledJobs = jobs.length - enabledJobs;
  const staggeredJobs = jobs.filter((job) => getCronStaggerMs(job) !== undefined).length;
  const invalidNextRunJobs = jobs.filter((job) => job.enabled && typeof job.state.nextRunAtMs !== "number").length;
  const sessionTargetCounts = jobs.reduce(
    (acc, job) => {
      acc[job.sessionTarget] += 1;
      return acc;
    },
    { main: 0, isolated: 0 },
  );
  const deliveryModeCounts = jobs.reduce(
    (acc, job) => {
      acc[job.delivery.mode] += 1;
      return acc;
    },
    { user: 0, none: 0 },
  );
  const failureDestinationModeCounts = jobs.reduce(
    (acc, job) => {
      const mode = job.failureDestination?.mode ?? "none";
      acc[mode] += 1;
      return acc;
    },
    { user: 0, none: 0 },
  );

  const running = input.enabled && schedulerStatus?.running === true;
  const activeRuns = schedulerStatus?.activeRuns ?? 0;
  const headlineParts = [
    input.enabled ? `enabled` : `disabled`,
    `jobs=${enabledJobs}/${jobs.length}`,
    `session main=${sessionTargetCounts.main}`,
    `isolated=${sessionTargetCounts.isolated}`,
    `delivery user=${deliveryModeCounts.user}`,
    `none=${deliveryModeCounts.none}`,
    `stagger=${staggeredJobs}`,
    `activeRuns=${activeRuns}`,
  ];
  if (invalidNextRunJobs > 0) {
    headlineParts.push(`invalidNextRun=${invalidNextRunJobs}`);
  }

  return {
    scheduler: {
      enabled: input.enabled,
      running,
      activeRuns,
      ...(typeof schedulerStatus?.lastTickAtMs === "number" ? { lastTickAtMs: schedulerStatus.lastTickAtMs } : {}),
    },
    totals: {
      totalJobs: jobs.length,
      enabledJobs,
      disabledJobs,
      staggeredJobs,
      invalidNextRunJobs,
    },
    sessionTargetCounts,
    deliveryModeCounts,
    failureDestinationModeCounts,
    recentJobs: summarizeCronJobs(jobs, input.recentJobLimit ?? 4),
    headline: headlineParts.join("; "),
  };
}
