import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { AgentRegistry, type AgentLaunchSpec } from "@belldandy/agent";
import {
  createSubTaskAgentCapabilities,
  createSubTaskResumeController,
  createSubTaskRuntimeEventHandler,
  createSubTaskUpdateController,
  createSubTaskWorktreeLifecycleHandler,
  reconcileSubTaskWorktreeRuntimes,
  SubTaskRuntimeStore,
} from "./task-runtime.js";

test("subtask runtime store persists lifecycle, progress, and output artifacts", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-runtime-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const task = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-1",
      agentId: "coder",
      instruction: "Implement a minimal runtime",
      channel: "test",
      timeoutMs: 45_000,
      toolSet: ["read", "write"],
      role: "coder",
      allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
      maxToolRiskLevel: "high",
      policySummary: "coder role policy",
    },
  });
  await store.markQueued(task.id, 2);
  await store.attachSession(task.id, "sub_1234");

  const handler = createSubTaskRuntimeEventHandler(store);
  handler({
    type: "thought_delta",
    sessionId: "sub_1234",
    delta: "Reviewing the current orchestration path",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = await store.completeTask(task.id, {
    status: "done",
    sessionId: "sub_1234",
    output: "Runtime implementation finished.",
  });

  expect(completed).toMatchObject({
    id: task.id,
    sessionId: "sub_1234",
    status: "done",
    outputPreview: "Runtime implementation finished.",
    launchSpec: {
      agentId: "coder",
      profileId: "coder",
      channel: "test",
      timeoutMs: 45_000,
      role: "coder",
      allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
      maxToolRiskLevel: "high",
      policySummary: "coder role policy",
    },
  });
  expect(completed?.outputPath).toBeTruthy();
  expect(await fs.readFile(String(completed?.outputPath), "utf-8")).toBe("Runtime implementation finished.");

  const reloaded = new SubTaskRuntimeStore(stateDir);
  await reloaded.load();
  const persisted = await reloaded.getTask(task.id);
  expect(persisted).toMatchObject({
    id: task.id,
    sessionId: "sub_1234",
    status: "done",
  });
  expect(persisted?.notifications.some((item) => item.kind === "completed")).toBe(true);
  expect(persisted?.progress.message).toBe("Task completed.");

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("task runtime agent capabilities wrap spawn results into structured task records", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-caps-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const handler = createSubTaskRuntimeEventHandler(store);
  const orchestrator = {
    async spawn(opts: {
      onQueued?: (position: number) => void;
      onSessionCreated?: (sessionId: string, agentId: string) => void;
      launchSpec: {
        agentId?: string;
      };
    }) {
      opts.onQueued?.(1);
      opts.onSessionCreated?.("sub_caps_1", opts.launchSpec.agentId ?? "default");
      handler({
        type: "thought_delta",
        sessionId: "sub_caps_1",
        delta: "Collecting implementation context",
      });
      return {
        success: true,
        output: "child agent finished",
        sessionId: "sub_caps_1",
      };
    },
    listSessions() {
      return [];
    },
  };

  const caps = createSubTaskAgentCapabilities({
    orchestrator: orchestrator as any,
    runtimeStore: store,
  });

  const result = await caps.spawnSubAgent!({
    parentConversationId: "conv-caps",
    agentId: "coder",
    instruction: "Implement task bridge",
  });

  expect(result).toMatchObject({
    success: true,
    sessionId: "sub_caps_1",
  });
  expect(result.taskId).toMatch(/^task_/);
  expect(result.outputPath).toBeTruthy();

  const sessions = await caps.listSessions!("conv-caps");
  expect(sessions).toEqual([
    expect.objectContaining({
      id: "sub_caps_1",
      taskId: result.taskId,
      agentId: "coder",
      status: "done",
      outputPath: result.outputPath,
    }),
  ]);

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("task runtime agent capabilities persist catalog-derived launch defaults", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-catalog-caps-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const registry = new AgentRegistry(() => ({
    async *run() {
      yield { type: "status", status: "running" } as const;
      yield { type: "final", text: "catalog done" } as const;
      yield { type: "status", status: "done" } as const;
    },
  }));
  registry.register({
    id: "default",
    displayName: "Default",
    model: "primary",
  });
  registry.register({
    id: "ops-coder",
    displayName: "Ops Coder",
    model: "primary",
    defaultRole: "coder",
    defaultPermissionMode: "confirm",
    defaultAllowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
    defaultMaxToolRiskLevel: "high",
  });

  const orchestrator = {
    async spawn(opts: {
      onSessionCreated?: (sessionId: string, agentId: string) => void;
      launchSpec: AgentLaunchSpec;
    }) {
      opts.onSessionCreated?.("sub_catalog_1", opts.launchSpec.agentId);
      return {
        success: true,
        output: "catalog child finished",
        sessionId: "sub_catalog_1",
      };
    },
    listSessions() {
      return [];
    },
  };

  const caps = createSubTaskAgentCapabilities({
    orchestrator: orchestrator as any,
    runtimeStore: store,
    agentRegistry: registry,
  });

  const result = await caps.spawnSubAgent!({
    parentConversationId: "conv-catalog",
    agentId: "ops-coder",
    instruction: "Implement task bridge",
  });

  const persisted = await store.getTask(String(result.taskId));
  expect(persisted?.launchSpec).toMatchObject({
    agentId: "ops-coder",
    profileId: "ops-coder",
    role: "coder",
    permissionMode: "confirm",
    allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
    maxToolRiskLevel: "high",
  });

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("task runtime agent capabilities persist resolved worktree launch runtime before spawn", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-worktree-caps-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();
  const requestedCwd = path.join(stateDir, "demo-repo", "src");
  const worktreeRoot = path.join(stateDir, "virtual-worktree", "repo");
  const resolvedCwd = path.join(worktreeRoot, "src");

  let receivedLaunchSpec: Record<string, unknown> | undefined;
  const orchestrator = {
    async spawn(opts: {
      launchSpec: Record<string, unknown>;
      onSessionCreated?: (sessionId: string, agentId: string) => void;
    }) {
      receivedLaunchSpec = opts.launchSpec;
      opts.onSessionCreated?.("sub_worktree_1", String(opts.launchSpec.agentId ?? "default"));
      return {
        success: true,
        output: "child agent finished in worktree",
        sessionId: "sub_worktree_1",
      };
    },
    listSessions() {
      return [];
    },
  };

  const caps = createSubTaskAgentCapabilities({
    orchestrator: orchestrator as any,
    runtimeStore: store,
    worktreeRuntime: {
      async prepareTaskLaunch(_taskId: string, launchSpec: AgentLaunchSpec) {
        return {
          launchSpec: {
            ...launchSpec,
            cwd: resolvedCwd,
          },
          summary: {
            resolvedCwd,
            worktreePath: worktreeRoot,
            worktreeRepoRoot: path.join(stateDir, "demo-repo"),
            worktreeBranch: "belldandy-task_1234",
            worktreeStatus: "created",
          },
        };
      },
    } as any,
  });

  const result = await caps.spawnSubAgent!({
    parentConversationId: "conv-worktree",
    agentId: "coder",
    instruction: "Implement task bridge in a worktree",
    cwd: requestedCwd,
    isolationMode: "worktree",
  });

  expect(result.success).toBe(true);
  expect(receivedLaunchSpec?.cwd).toBe(resolvedCwd);

  const persisted = await store.getTask(String(result.taskId));
  expect(persisted?.launchSpec).toMatchObject({
    cwd: requestedCwd,
    resolvedCwd,
    worktreePath: worktreeRoot,
    worktreeRepoRoot: path.join(stateDir, "demo-repo"),
    worktreeBranch: "belldandy-task_1234",
    worktreeStatus: "created",
  });

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("subtask runtime store supports stop request and archive filtering", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-stop-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const pending = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-stop",
      agentId: "coder",
      instruction: "Wait in queue",
    },
  });
  const requested = await store.requestStop(pending.id, "Stop before execution.");
  expect(requested).toMatchObject({
    id: pending.id,
    stopReason: "Stop before execution.",
  });

  const stopped = await store.markStopped(pending.id, { reason: "Stopped before execution." });
  expect(stopped).toMatchObject({
    id: pending.id,
    status: "stopped",
    stopReason: "Stopped before execution.",
  });

  await store.archiveTask(pending.id, "Archived after manual review.");
  const activeItems = await store.listTasks("conv-stop");
  expect(activeItems).toHaveLength(0);

  const archivedItems = await store.listTasks("conv-stop", { includeArchived: true });
  expect(archivedItems).toEqual([
    expect.objectContaining({
      id: pending.id,
      status: "stopped",
      archiveReason: "Archived after manual review.",
      archivedAt: expect.any(Number),
    }),
  ]);

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("subtask runtime store persists steering records and ignores stale session completion", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-steering-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const task = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-steer",
      agentId: "coder",
      instruction: "Implement runtime bridge",
    },
  });
  await store.attachSession(task.id, "sub_steer_1");

  const accepted = await store.requestSteering(task.id, "Focus on the failing integration path.", {
    sessionId: "sub_steer_1",
  });
  expect(accepted?.steering).toMatchObject({
    status: "accepted",
    requestedSessionId: "sub_steer_1",
  });

  await store.attachSession(task.id, "sub_steer_2");
  await store.markSteeringDelivered(task.id, String(accepted?.steering.id), { sessionId: "sub_steer_2" });

  const stale = await store.completeTask(task.id, {
    status: "stopped",
    sessionId: "sub_steer_1",
    error: "stale stop",
  });
  expect(stale?.sessionId).toBe("sub_steer_2");
  expect(stale?.status).toBe("running");

  const completed = await store.completeTask(task.id, {
    status: "done",
    sessionId: "sub_steer_2",
    output: "updated result",
  });
  expect(completed).toMatchObject({
    sessionId: "sub_steer_2",
    status: "done",
  });
  expect(completed?.steering).toEqual([
    expect.objectContaining({
      status: "delivered",
      deliveredSessionId: "sub_steer_2",
    }),
  ]);

  const reloaded = new SubTaskRuntimeStore(stateDir);
  await reloaded.load();
  const persisted = await reloaded.getTask(task.id);
  expect(persisted?.steering).toEqual([
    expect.objectContaining({
      status: "delivered",
      deliveredSessionId: "sub_steer_2",
    }),
  ]);

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("subtask runtime store persists resume records across reload", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-resume-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const task = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-resume",
      agentId: "coder",
      instruction: "Continue runtime bridge",
    },
  });
  await store.attachSession(task.id, "sub_resume_1");
  await store.completeTask(task.id, {
    status: "done",
    sessionId: "sub_resume_1",
    output: "first result",
  });

  const accepted = await store.requestResume(task.id, "Continue with the remaining integration cases.", {
    sessionId: "sub_resume_1",
  });
  expect(accepted?.resume).toMatchObject({
    status: "accepted",
    requestedSessionId: "sub_resume_1",
  });

  await store.attachSession(task.id, "sub_resume_2");
  await store.markResumeDelivered(task.id, String(accepted?.resume.id), {
    sessionId: "sub_resume_2",
    resumedFromSessionId: "sub_resume_1",
  });

  const completed = await store.completeTask(task.id, {
    status: "done",
    sessionId: "sub_resume_2",
    output: "second result",
  });
  expect(completed?.resume).toEqual([
    expect.objectContaining({
      status: "delivered",
      deliveredSessionId: "sub_resume_2",
      resumedFromSessionId: "sub_resume_1",
    }),
  ]);

  const reloaded = new SubTaskRuntimeStore(stateDir);
  await reloaded.load();
  const persisted = await reloaded.getTask(task.id);
  expect(persisted?.resume).toEqual([
    expect.objectContaining({
      status: "delivered",
      deliveredSessionId: "sub_resume_2",
      resumedFromSessionId: "sub_resume_1",
    }),
  ]);

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("createSubTaskUpdateController records steering and relaunches the same task with prior history", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-update-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const task = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-update",
      agentId: "coder",
      instruction: "Implement runtime bridge",
      channel: "subtask",
    },
  });
  await store.attachSession(task.id, "sub_update_1", "coder");

  const stops: string[] = [];
  const spawns: Array<Record<string, unknown>> = [];
  const controller = createSubTaskUpdateController({
    runtimeStore: store,
    conversationStore: {
      get: (conversationId: string) => conversationId === "sub_update_1"
        ? {
          messages: [
            { role: "user", content: "Implement runtime bridge" },
            { role: "assistant", content: "Need to inspect failing tests first." },
          ],
        }
        : undefined,
    },
    orchestrator: {
      getSession(sessionId: string) {
        if (sessionId !== "sub_update_1") return undefined;
        return {
          id: sessionId,
          status: "running" as const,
          launchSpec: {
            parentConversationId: "conv-update",
            agentId: "coder",
            profileId: "coder",
            instruction: "Implement runtime bridge",
            background: true,
            timeoutMs: 60_000,
            channel: "subtask",
          },
        };
      },
      async stopSession(sessionId: string) {
        stops.push(sessionId);
        await store.completeTask(task.id, {
          status: "stopped",
          sessionId,
          error: "relaunching after steering",
        });
        return true;
      },
      async spawn(opts: any) {
        spawns.push({
          instruction: opts.launchSpec?.instruction,
          history: opts.history,
          resumedFromSessionId: opts.resumedFromSessionId,
        });
        opts.onSessionCreated?.("sub_update_2", String(opts.launchSpec?.agentId ?? "coder"));
        return {
          success: true,
          output: "steered result",
          sessionId: "sub_update_2",
        };
      },
    } as any,
  });

  const accepted = await controller(task.id, "Prioritize the integration failure and skip unrelated cleanup.");
  expect(accepted?.steering).toEqual([
    expect.objectContaining({
      status: "accepted",
    }),
  ]);

  let updated = await store.getTask(task.id);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (updated?.status === "done") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    updated = await store.getTask(task.id);
  }

  expect(stops).toEqual(["sub_update_1"]);
  expect(spawns).toEqual([
    expect.objectContaining({
      instruction: "Prioritize the integration failure and skip unrelated cleanup.",
      resumedFromSessionId: "sub_update_1",
      history: [
        { role: "user", content: "Implement runtime bridge" },
        { role: "assistant", content: "Need to inspect failing tests first." },
      ],
    }),
  ]);

  expect(updated).toMatchObject({
    sessionId: "sub_update_2",
    status: "done",
  });
  expect(updated?.steering).toEqual([
    expect.objectContaining({
      status: "delivered",
      deliveredSessionId: "sub_update_2",
    }),
  ]);

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("createSubTaskResumeController relaunches a finished task with prior history", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-resume-controller-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const task = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-resume-controller",
      agentId: "coder",
      instruction: "Implement runtime bridge",
      channel: "subtask",
    },
  });
  await store.attachSession(task.id, "sub_resume_controller_1", "coder");
  await store.completeTask(task.id, {
    status: "done",
    sessionId: "sub_resume_controller_1",
    output: "first pass finished",
  });

  const spawns: Array<Record<string, unknown>> = [];
  const controller = createSubTaskResumeController({
    runtimeStore: store,
    conversationStore: {
      get: (conversationId: string) => conversationId === "sub_resume_controller_1"
        ? {
          messages: [
            { role: "user", content: "Implement runtime bridge" },
            { role: "assistant", content: "First pass finished, but integration coverage is still missing." },
          ],
        }
        : undefined,
    },
    orchestrator: {
      getSession(sessionId: string) {
        if (sessionId !== "sub_resume_controller_1") return undefined;
        return {
          id: sessionId,
          status: "done" as const,
          launchSpec: {
            parentConversationId: "conv-resume-controller",
            agentId: "coder",
            profileId: "coder",
            instruction: "Implement runtime bridge",
            background: true,
            timeoutMs: 60_000,
            channel: "subtask",
          },
        };
      },
      async spawn(opts: any) {
        spawns.push({
          instruction: opts.launchSpec?.instruction,
          history: opts.history,
          resumedFromSessionId: opts.resumedFromSessionId,
        });
        opts.onSessionCreated?.("sub_resume_controller_2", String(opts.launchSpec?.agentId ?? "coder"));
        return {
          success: true,
          output: "second pass finished",
          sessionId: "sub_resume_controller_2",
        };
      },
    } as any,
  });

  const accepted = await controller(task.id, "Continue from the first pass and close the missing integration coverage.");
  expect(accepted?.resume).toEqual([
    expect.objectContaining({
      status: "accepted",
    }),
  ]);

  let updated = await store.getTask(task.id);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (updated?.status === "done" && updated?.sessionId === "sub_resume_controller_2") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    updated = await store.getTask(task.id);
  }

  expect(spawns).toEqual([
    expect.objectContaining({
      resumedFromSessionId: "sub_resume_controller_1",
      history: [
        { role: "user", content: "Implement runtime bridge" },
        { role: "assistant", content: "First pass finished, but integration coverage is still missing." },
      ],
    }),
  ]);
  expect(String(spawns[0]?.instruction || "")).toContain("Resume guidance: Continue from the first pass");

  expect(updated).toMatchObject({
    sessionId: "sub_resume_controller_2",
    status: "done",
  });
  expect(updated?.resume).toEqual([
    expect.objectContaining({
      status: "delivered",
      deliveredSessionId: "sub_resume_controller_2",
      resumedFromSessionId: "sub_resume_controller_1",
    }),
  ]);

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("reconcileSubTaskWorktreeRuntimes recovers active tasks and cleans archived worktrees", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-reconcile-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const activeTask = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-reconcile",
      agentId: "coder",
      instruction: "Recover active worktree runtime",
      cwd: path.join(stateDir, "repo", "src"),
      isolationMode: "worktree",
    },
  });
  await store.updateTaskWorktreeRuntime(activeTask.id, {
    runtimeSummary: {
      requestedCwd: path.join(stateDir, "repo", "src"),
      resolvedCwd: path.join(stateDir, "worktrees", activeTask.id, "src"),
      worktreePath: path.join(stateDir, "worktrees", activeTask.id),
      worktreeRepoRoot: path.join(stateDir, "repo"),
      worktreeBranch: `belldandy-${activeTask.id}`,
      worktreeStatus: "created",
    },
  });

  const archivedTask = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-reconcile",
      agentId: "coder",
      instruction: "Cleanup archived worktree runtime",
      cwd: path.join(stateDir, "repo", "pkg"),
      isolationMode: "worktree",
    },
  });
  await store.updateTaskWorktreeRuntime(archivedTask.id, {
    runtimeSummary: {
      requestedCwd: path.join(stateDir, "repo", "pkg"),
      resolvedCwd: path.join(stateDir, "worktrees", archivedTask.id, "pkg"),
      worktreePath: path.join(stateDir, "worktrees", archivedTask.id),
      worktreeRepoRoot: path.join(stateDir, "repo"),
      worktreeBranch: `belldandy-${archivedTask.id}`,
      worktreeStatus: "created",
    },
  });
  await store.completeTask(archivedTask.id, {
    status: "done",
    output: "archived result",
  });
  await store.archiveTask(archivedTask.id, "Archive after completion.");

  const reconcileCalls: string[] = [];
  const cleanupCalls: string[] = [];
  const result = await reconcileSubTaskWorktreeRuntimes({
    runtimeStore: store,
    worktreeRuntime: {
      async reconcileTaskRuntime(taskId: string, runtime: Record<string, unknown>) {
        reconcileCalls.push(taskId);
        return {
          requestedCwd: runtime.cwd as string,
          resolvedCwd: path.join(String(runtime.worktreePath), "recovered"),
          worktreePath: runtime.worktreePath as string,
          worktreeRepoRoot: runtime.worktreeRepoRoot as string,
          worktreeBranch: runtime.worktreeBranch as string,
          worktreeStatus: "created",
        };
      },
      async cleanupTaskRuntime(taskId: string, runtime: Record<string, unknown>) {
        cleanupCalls.push(taskId);
        return {
          requestedCwd: runtime.cwd as string,
          resolvedCwd: runtime.resolvedCwd as string,
          worktreePath: runtime.worktreePath as string,
          worktreeRepoRoot: runtime.worktreeRepoRoot as string,
          worktreeBranch: runtime.worktreeBranch as string,
          worktreeStatus: "removed",
        };
      },
    } as any,
  });

  expect(result).toMatchObject({
    scanned: 2,
    reconciled: 1,
    cleaned: 1,
    failed: 0,
  });
  expect(reconcileCalls).toEqual([activeTask.id]);
  expect(cleanupCalls).toEqual([archivedTask.id]);

  const activeRecord = await store.getTask(activeTask.id);
  const archivedRecord = await store.getTask(archivedTask.id);
  expect(activeRecord?.launchSpec).toMatchObject({
    worktreeStatus: "created",
    resolvedCwd: path.join(String(activeRecord?.launchSpec.worktreePath), "recovered"),
  });
  expect(archivedRecord?.launchSpec.worktreeStatus).toBe("removed");

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("createSubTaskWorktreeLifecycleHandler cleans archived worktrees asynchronously", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-subtask-lifecycle-"));
  const store = new SubTaskRuntimeStore(stateDir);
  await store.load();

  const task = await store.createTask({
    launchSpec: {
      parentConversationId: "conv-lifecycle",
      agentId: "coder",
      instruction: "Archive and cleanup",
      cwd: path.join(stateDir, "repo", "src"),
      isolationMode: "worktree",
    },
  });
  await store.updateTaskWorktreeRuntime(task.id, {
    runtimeSummary: {
      requestedCwd: path.join(stateDir, "repo", "src"),
      resolvedCwd: path.join(stateDir, "worktrees", task.id, "src"),
      worktreePath: path.join(stateDir, "worktrees", task.id),
      worktreeRepoRoot: path.join(stateDir, "repo"),
      worktreeBranch: `belldandy-${task.id}`,
      worktreeStatus: "created",
    },
  });
  await store.completeTask(task.id, {
    status: "done",
    output: "ready to archive",
  });

  const cleanupCalls: string[] = [];
  store.subscribe(createSubTaskWorktreeLifecycleHandler({
    runtimeStore: store,
    worktreeRuntime: {
      async cleanupTaskRuntime(taskId: string, runtime: Record<string, unknown>) {
        cleanupCalls.push(taskId);
        return {
          requestedCwd: runtime.cwd as string,
          resolvedCwd: runtime.resolvedCwd as string,
          worktreePath: runtime.worktreePath as string,
          worktreeRepoRoot: runtime.worktreeRepoRoot as string,
          worktreeBranch: runtime.worktreeBranch as string,
          worktreeStatus: "removed",
        };
      },
    } as any,
  }));

  await store.archiveTask(task.id, "Archive task and cleanup worktree.");
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(cleanupCalls).toEqual([task.id]);
  const archived = await store.getTask(task.id);
  expect(archived?.launchSpec.worktreeStatus).toBe("removed");

  await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});
