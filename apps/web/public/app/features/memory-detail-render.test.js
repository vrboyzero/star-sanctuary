import { describe, expect, it } from "vitest";

import {
  buildTaskSourceActivityReference,
  buildTaskSourceExplanationItems,
} from "./memory-detail-render.js";

describe("memory detail source explanation helpers", () => {
  it("maps structured source refs into display items", () => {
    expect(buildTaskSourceExplanationItems({
      sourceRefs: [
        {
          kind: "task_summary",
          previews: ["已补统一高层接入壳。"],
        },
        {
          kind: "work_recap",
          previews: ["已确认 4 条执行事实。", "当前停在 explain_sources RPC。"],
          activityIds: ["act-2", "act-3"],
        },
        {
          kind: "activity_worklog",
          previews: ["已执行工具 apply_patch"],
          activityIds: ["act-2"],
        },
      ],
    })).toEqual([
      {
        kind: "task_summary",
        label: "任务摘要",
        previews: ["已补统一高层接入壳。"],
        activityIds: [],
      },
      {
        kind: "work_recap",
        label: "Work Recap",
        previews: ["已确认 4 条执行事实。", "当前停在 explain_sources RPC。"],
        activityIds: ["act-2", "act-3"],
      },
      {
        kind: "activity_worklog",
        label: "Activity / Worklog",
        previews: ["已执行工具 apply_patch"],
        activityIds: ["act-2"],
      },
    ]);
  });

  it("filters blank previews and falls back to provided labels for unknown kinds", () => {
    expect(buildTaskSourceExplanationItems({
      sourceRefs: [
        {
          kind: "custom_kind",
          label: "Custom Source",
          previews: ["  ", "保留这条自定义来源。"],
          activityIds: [" act-9 ", ""],
        },
      ],
    })).toEqual([
      {
        kind: "custom_kind",
        label: "Custom Source",
        previews: ["保留这条自定义来源。"],
        activityIds: ["act-9"],
      },
    ]);
  });

  it("compacts activity ids into tooltip metadata", () => {
    expect(buildTaskSourceActivityReference([" act-2 ", "", "act-3"])).toEqual({
      activityIds: ["act-2", "act-3"],
      badgeLabel: "活动 2",
      title: "Activity IDs: act-2, act-3",
    });
    expect(buildTaskSourceActivityReference([])).toBeNull();
  });
});
