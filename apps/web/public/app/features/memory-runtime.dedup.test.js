// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryRuntimeFeature } from "./memory-runtime.js";

function createHarness(sendReq) {
  const state = {
    tab: "tasks",
    items: [],
    stats: null,
    selectedTask: { id: "task-1" },
    selectedCandidate: null,
    pendingExperienceActionKey: null,
    activeAgentId: "default",
  };

  const showNotice = vi.fn();

  const feature = createMemoryRuntimeFeature({
    refs: {
      memoryViewerSection: null,
      memoryTaskGoalFilterBarEl: null,
      memoryTaskGoalFilterLabelEl: null,
    },
    isConnected: () => true,
    sendReq,
    makeId: (() => {
      let seq = 0;
      return () => `req-${++seq}`;
    })(),
    getMemoryViewerState: () => state,
    getMemoryViewerFeature: () => ({
      loadMemoryViewer: vi.fn(),
      loadMemoryViewerStats: vi.fn(),
      loadTaskUsageOverview: vi.fn(),
      loadTaskViewer: vi.fn(),
      loadMemoryChunkViewer: vi.fn(),
      switchMemoryViewerTab: vi.fn(),
      syncMemoryViewerUi: vi.fn(),
    }),
    getCurrentAgentSelection: () => "default",
    getGoalDisplayName: () => "",
    switchMode: vi.fn(),
    loadGoals: vi.fn(async () => {}),
    showNotice,
    renderMemoryViewerStats: vi.fn(),
    renderTaskList: vi.fn(),
    renderMemoryList: vi.fn(),
    renderSharedReviewList: vi.fn(),
    renderTaskDetail: vi.fn(),
    renderCandidateOnlyDetail: vi.fn(),
    renderMemoryDetail: vi.fn(),
    renderMemoryViewerListEmpty: vi.fn(),
    renderMemoryViewerDetailEmpty: vi.fn(),
    getCurrentAgentLabel: () => "default",
    t: (_key, params, fallback) => {
      let text = fallback ?? "";
      if (params && typeof params === "object") {
        Object.entries(params).forEach(([key, value]) => {
          text = text.replaceAll(`{${key}}`, String(value ?? ""));
        });
      }
      return text;
    },
  });

  return {
    state,
    feature,
    showNotice,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("memory runtime duplicate precheck", () => {
  it("opens existing candidate when duplicate_existing is confirmed", async () => {
    const sendReq = vi.fn(async (req) => {
      if (req.method === "experience.candidate.check_duplicate") {
        return {
          ok: true,
          payload: {
            type: "method",
            taskId: "task-1",
            title: "实现候选层",
            slug: "method-demo",
            decision: "duplicate_existing",
            exactMatch: {
              source: "candidate",
              assetType: "method",
              key: "method-demo",
              title: "实现候选层",
              candidateId: "exp-dup-1",
              candidateStatus: "draft",
            },
            similarMatches: [],
          },
        };
      }
      if (req.method === "experience.candidate.get") {
        return {
          ok: true,
          payload: {
            candidate: {
              id: "exp-dup-1",
              title: "实现候选层",
            },
          },
        };
      }
      throw new Error(`unexpected method ${req.method}`);
    });
    const { feature } = createHarness(sendReq);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const result = await feature.generateExperienceCandidate("task-1", "method");

    expect(result).toEqual({
      id: "exp-dup-1",
      title: "实现候选层",
    });
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(sendReq.mock.calls.map(([req]) => req.method)).toEqual([
      "experience.candidate.check_duplicate",
      "experience.candidate.get",
    ]);
  });

  it("continues generation when similar_existing is confirmed", async () => {
    const sendReq = vi.fn(async (req) => {
      if (req.method === "experience.candidate.check_duplicate") {
        return {
          ok: true,
          payload: {
            type: "skill",
            taskId: "task-1",
            title: "修复任务",
            slug: "skill-demo",
            decision: "similar_existing",
            similarMatches: [
              {
                source: "skill_asset",
                assetType: "skill",
                key: "skill-demo",
                title: "修复任务技能",
              },
            ],
          },
        };
      }
      if (req.method === "experience.candidate.generate") {
        return {
          ok: true,
          payload: {
            candidate: {
              id: "exp-new-1",
              title: "修复任务",
            },
            created: true,
            reusedExisting: false,
          },
        };
      }
      if (req.method === "memory.task.get") {
        return { ok: true, payload: { task: { id: "task-1" } } };
      }
      if (req.method === "experience.candidate.get") {
        return { ok: true, payload: { candidate: { id: "exp-new-1", title: "修复任务" } } };
      }
      throw new Error(`unexpected method ${req.method}`);
    });
    const { feature } = createHarness(sendReq);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const result = await feature.generateExperienceCandidate("task-1", "skill");

    expect(result).toEqual({
      id: "exp-new-1",
      title: "修复任务",
    });
    expect(sendReq.mock.calls.map(([req]) => req.method)).toEqual([
      "experience.candidate.check_duplicate",
      "experience.candidate.generate",
      "memory.task.get",
      "experience.candidate.get",
    ]);
  });
});
