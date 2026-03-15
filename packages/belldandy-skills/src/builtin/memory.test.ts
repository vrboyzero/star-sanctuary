import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../types.js";

const manager = {
  search: vi.fn(),
  indexWorkspace: vi.fn(),
  getStatus: vi.fn(),
  linkTaskMemories: vi.fn(),
  linkTaskMemoriesFromSource: vi.fn(),
  assignMemorySourceAgent: vi.fn(),
  promoteMemoryChunk: vi.fn(),
  promoteMemorySource: vi.fn(),
  searchTasks: vi.fn(),
  getRecentTasks: vi.fn(),
  getTaskDetail: vi.fn(),
};

const readMemoryFile = vi.fn();
const writeMemoryFile = vi.fn();
const appendToTodayMemory = vi.fn();

vi.mock("@belldandy/memory", () => ({
  MemoryManager: vi.fn(),
  getGlobalMemoryManager: () => manager,
  appendToTodayMemory,
  readMemoryFile,
  writeMemoryFile,
}));

const mod = await import("./memory.js");

const baseContext: ToolContext = {
  conversationId: "conv-1",
  workspaceRoot: "E:/project/star-sanctuary/.star_sanctuary",
  policy: {
    allowedPaths: [],
    deniedPaths: [],
    allowedDomains: [],
    deniedDomains: [],
    maxTimeoutMs: 30_000,
    maxResponseBytes: 512_000,
  },
};

const agentContext: ToolContext = {
  ...baseContext,
  agentId: "agent-belldandy",
};

describe("memory tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    manager.getStatus.mockReturnValue({
      files: 2,
      chunks: 10,
      vectorIndexed: 5,
      vectorCached: 3,
      summarized: 4,
      summaryPending: 1,
    });
  });

  it("memory_search should link used memories", async () => {
    manager.search.mockResolvedValue([
      {
        id: "chunk-1",
        sourcePath: "memory/2026-03-15.md",
        sourceType: "file",
        snippet: "记忆片段一",
        summary: "摘要一",
        score: 0.9,
        startLine: 12,
      },
    ]);

    const result = await mod.memorySearchTool.execute({
      query: "测试检索",
      limit: 3,
    }, baseContext);

    expect(result.success).toBe(true);
    expect(result.output).toContain("摘要一");
    expect(manager.linkTaskMemories).toHaveBeenCalledWith("conv-1", ["chunk-1"], "used");
  });

  it("memory_search should pass explicit shared scope with agent context", async () => {
    manager.search.mockResolvedValue([
      {
        id: "chunk-shared",
        sourcePath: "memory/shared.md",
        sourceType: "file",
        snippet: "共享记忆片段",
        summary: "共享摘要",
        score: 0.88,
        startLine: 8,
        visibility: "shared",
      },
    ]);

    const result = await mod.memorySearchTool.execute({
      query: "共享经验",
      limit: 2,
      scope: "shared",
    }, agentContext);

    expect(result.success).toBe(true);
    expect(manager.search).toHaveBeenCalledWith("共享经验", {
      limit: 2,
      filter: {
        scope: "shared",
        agentId: "agent-belldandy",
      },
    });
    expect(result.output).toContain("[shared]");
  });

  it("memory_read should render file content", async () => {
    readMemoryFile.mockResolvedValue({
      path: "memory/2026-03-15.md",
      totalLines: 3,
      text: "# 2026-03-15\n\n- 一条记忆",
    });

    const result = await mod.memoryReadTool.execute({
      path: "memory/2026-03-15.md",
    }, baseContext);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Total Lines: 3");
    expect(result.output).toContain("- 一条记忆");
    expect(manager.linkTaskMemoriesFromSource).toHaveBeenCalledWith(
      "conv-1",
      "memory/2026-03-15.md",
      "used",
    );
  });

  it("memory_write should append to today file and link generated memory", async () => {
    appendToTodayMemory.mockResolvedValue("E:/project/star-sanctuary/.star_sanctuary/memory/2026-03-15.md");

    const result = await mod.memoryWriteTool.execute({
      content: "- 新记忆",
    }, baseContext);

    expect(result.success).toBe(true);
    expect(appendToTodayMemory).toHaveBeenCalled();
    expect(manager.linkTaskMemoriesFromSource).toHaveBeenCalledWith(
      "conv-1",
      "E:/project/star-sanctuary/.star_sanctuary/memory/2026-03-15.md",
      "generated",
    );
  });

  it("memory_write should register source owner when agent context exists", async () => {
    appendToTodayMemory.mockResolvedValue("E:/project/star-sanctuary/.star_sanctuary/memory/2026-03-15.md");

    const result = await mod.memoryWriteTool.execute({
      content: "- Agent 记忆",
    }, agentContext);

    expect(result.success).toBe(true);
    expect(manager.assignMemorySourceAgent).toHaveBeenCalledWith(
      "E:/project/star-sanctuary/.star_sanctuary/memory/2026-03-15.md",
      "agent-belldandy",
    );
  });

  it("memory_share_promote should promote a single chunk", async () => {
    manager.promoteMemoryChunk.mockReturnValue({
      id: "chunk-1",
      sourcePath: "memory/2026-03-15.md",
      visibility: "shared",
    });

    const result = await mod.memorySharePromoteTool.execute({
      chunk_id: "chunk-1",
    }, baseContext);

    expect(result.success).toBe(true);
    expect(manager.promoteMemoryChunk).toHaveBeenCalledWith("chunk-1");
    expect(manager.linkTaskMemories).toHaveBeenCalledWith("conv-1", ["chunk-1"], "referenced");
    expect(result.output).toContain("Promoted 1 chunk to shared.");
    expect(result.output).toContain("Visibility: shared");
  });

  it("memory_share_promote should promote all chunks by source path", async () => {
    manager.promoteMemorySource.mockReturnValue({
      count: 2,
      chunks: [
        { id: "chunk-a" },
        { id: "chunk-b" },
      ],
    });

    const result = await mod.memorySharePromoteTool.execute({
      source_path: "memory/shared.md",
    }, baseContext);

    expect(result.success).toBe(true);
    expect(manager.promoteMemorySource).toHaveBeenCalledWith("memory/shared.md");
    expect(manager.linkTaskMemoriesFromSource).toHaveBeenCalledWith(
      "conv-1",
      "memory/shared.md",
      "referenced",
    );
    expect(result.output).toContain("Promoted 2 chunks to shared.");
    expect(result.output).toContain("chunk-a, chunk-b");
  });

  it("task_recent should render task list", async () => {
    manager.getRecentTasks.mockReturnValue([
      {
        id: "task_1",
        status: "success",
        source: "chat",
        startedAt: "2026-03-15T00:00:00.000Z",
        finishedAt: "2026-03-15T00:01:00.000Z",
        title: "修复任务",
        summary: "完成修复。",
      },
    ]);

    const result = await mod.taskRecentTool.execute({}, baseContext);

    expect(result.success).toBe(true);
    expect(result.output).toContain("修复任务");
    expect(result.output).toContain("task_1");
  });

  it("task_get should render readable detail with memory links", async () => {
    manager.getTaskDetail.mockReturnValue({
      id: "task_1",
      conversationId: "conv-1",
      status: "success",
      source: "chat",
      startedAt: "2026-03-15T00:00:00.000Z",
      finishedAt: "2026-03-15T00:01:00.000Z",
      title: "修复任务",
      objective: "修复记忆问题",
      summary: "已经修复。",
      reflection: "以后先查 task_recent。",
      toolCalls: [{ toolName: "memory_search", success: true, durationMs: 120 }],
      memoryLinks: [
        {
          chunkId: "chunk-1",
          relation: "used",
          sourcePath: "memory/2026-03-15.md",
          memoryType: "daily",
          snippet: "记忆片段一",
        },
      ],
    });

    const result = await mod.taskGetTool.execute({ task_id: "task_1" }, baseContext);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Task: 修复任务");
    expect(result.output).toContain("Memory Links:");
    expect(result.output).toContain("memory/2026-03-15.md");
    expect(result.output).toContain("记忆片段一");
  });

  it("memory_index should report index status", async () => {
    manager.indexWorkspace.mockResolvedValue(undefined);

    const result = await mod.memoryIndexTool.execute({}, baseContext);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Files: 2");
    expect(result.output).toContain("Chunks: 10");
  });
});
