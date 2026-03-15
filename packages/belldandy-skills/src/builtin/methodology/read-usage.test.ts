import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ToolContext } from "../../types.js";

const memoryManager = {
  getTaskByConversation: vi.fn(),
  recordMethodUsage: vi.fn(),
};

vi.mock("@belldandy/memory", () => ({
  getGlobalMemoryManager: () => memoryManager,
}));

const { methodReadTool } = await import("./read.js");

describe("method_read usage recording", () => {
  let stateDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-method-read-"));
    context = {
      conversationId: "conv-method-usage",
      workspaceRoot: stateDir,
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 1000,
        maxResponseBytes: 1024 * 1024,
      },
    };

    const methodsDir = path.join(stateDir, "methods");
    await fs.mkdir(methodsDir, { recursive: true });
    await fs.writeFile(
      path.join(methodsDir, "网页自动化基础.md"),
      "# 网页自动化基础方法\n\n## 适用场景\n- 中文文件名",
      "utf-8",
    );
  });

  afterEach(async () => {
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it("records method usage when current conversation has a task", async () => {
    memoryManager.getTaskByConversation.mockReturnValue({
      id: "task_method_usage_1",
      conversationId: "conv-method-usage",
    });

    const result = await methodReadTool.execute({ filename: "网页自动化基础.md" }, context);

    expect(result.success).toBe(true);
    expect(memoryManager.getTaskByConversation).toHaveBeenCalledWith("conv-method-usage");
    expect(memoryManager.recordMethodUsage).toHaveBeenCalledWith("task_method_usage_1", "网页自动化基础.md", {
      usedVia: "tool",
    });
  });

  it("does not fail when no task is available", async () => {
    memoryManager.getTaskByConversation.mockReturnValue(null);

    const result = await methodReadTool.execute({ filename: "网页自动化基础.md" }, context);

    expect(result.success).toBe(true);
    expect(memoryManager.recordMethodUsage).not.toHaveBeenCalled();
  });
});
