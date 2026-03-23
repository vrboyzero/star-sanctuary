import fs from "node:fs/promises";
import path from "node:path";
import type { LongTermGoal } from "./types.js";
import { ensureGoalRuntime } from "./runtime.js";
import { createEmptyGoalTaskGraph } from "./task-graph.js";

function buildNorthstar(goal: LongTermGoal): string {
  return `# NORTHSTAR.md

## Goal

- ID: ${goal.id}
- Title: ${goal.title}
- Status: ${goal.status}
- Current Phase: ${goal.currentPhase ?? "aligning"}

## Paths

- Goal Root: ${goal.goalRoot}
- Runtime Root: ${goal.runtimeRoot}
- Doc Root: ${goal.docRoot}
- Tasks Path: ${goal.tasksPath}
- Progress Path: ${goal.progressPath}
- Registry Path: ${goal.registryPath}

## Objective

${goal.objective ?? "- 待完善"}

## Constraints

- 暂无

## Non-goals

- 暂无

## Quality Gates

- 关键状态必须外部化
- 高风险节点必须可中断/可恢复
`;
}

export async function scaffoldGoalFiles(goal: LongTermGoal): Promise<void> {
  await fs.mkdir(goal.docRoot, { recursive: true });
  await ensureFile(path.join(goal.docRoot, "00-goal.md"), `# 00-goal\n\n## 用户原始目标\n\n${goal.objective ?? "- 待补充"}\n`);
  await ensureFile(path.join(goal.docRoot, "01-target-solution.md"), "# 01-target-solution\n\n");
  await ensureFile(path.join(goal.docRoot, "02-design.md"), "# 02-design\n\n");
  await ensureFile(path.join(goal.docRoot, "03-architecture-and-implementation.md"), "# 03-architecture-and-implementation\n\n");
  await ensureFile(path.join(goal.docRoot, "04-split-plan.md"), "# 04-split-plan\n\n");
  await ensureFile(path.join(goal.docRoot, "05-task-list.md"), "# 05-task-list\n\n");
  await ensureFile(path.join(goal.docRoot, "06-retrospective.md"), "# 06-retrospective\n\n");
  await ensureFile(path.join(goal.docRoot, "07-method-candidates.md"), "# 07-method-candidates\n\n");
  await ensureFile(path.join(goal.docRoot, "08-skill-candidates.md"), "# 08-skill-candidates\n\n");
  await ensureFile(path.join(goal.docRoot, "09-flow-patterns.md"), "# 09-flow-patterns\n\n");
  await ensureFile(goal.northstarPath, buildNorthstar(goal));
  await ensureFile(goal.tasksPath, `${JSON.stringify(createEmptyGoalTaskGraph(goal.id), null, 2)}\n`);
  await ensureFile(goal.progressPath, "# progress\n\n");
  await ensureFile(goal.handoffPath, "# handoff\n\n");
  await ensureGoalRuntime(goal);
}

async function ensureFile(targetPath: string, content: string): Promise<void> {
  try {
    await fs.access(targetPath);
  } catch {
    await fs.writeFile(targetPath, content, "utf-8");
  }
}
