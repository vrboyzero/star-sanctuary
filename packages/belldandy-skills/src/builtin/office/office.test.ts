import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import crypto from "node:crypto";
import type { ToolContext } from "../../types.js";
import { normalizeWorkshopCategory } from "./client.js";
import {
  officeWorkshopSearchTool,
  officeWorkshopDownloadTool,
  officeWorkshopPublishTool,
  officeWorkshopMineTool,
  officeWorkshopUpdateTool,
  officeWorkshopDeleteTool,
  officeHomesteadGetTool,
  officeHomesteadPlaceTool,
  officeHomesteadMountTool,
  officeHomesteadUnmountTool,
  officeHomesteadOpenBlindBoxTool,
} from "./index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("office tools", () => {
  let tempDir: string;
  let stateDir: string;
  let context: ToolContext;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalStateDir: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-office-test-"));
    stateDir = path.join(tempDir, ".belldandy-state");
    await fs.mkdir(stateDir, { recursive: true });

    originalStateDir = process.env.BELLDANDY_STATE_DIR;
    process.env.BELLDANDY_STATE_DIR = stateDir;

    await fs.writeFile(
      path.join(stateDir, "community.json"),
      JSON.stringify({
        endpoint: "http://office.test",
        agents: [
          {
            name: "贝露丹蒂",
            apiKey: "gro_test_key",
          },
        ],
      }, null, 2),
      "utf-8",
    );

    context = {
      conversationId: "test-conv",
      workspaceRoot: tempDir,
      policy: {
        allowedPaths: [],
        deniedPaths: [".git", "node_modules", ".env"],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5000,
        maxResponseBytes: 1024 * 1024,
      },
    };

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalStateDir === undefined) {
      delete process.env.BELLDANDY_STATE_DIR;
    } else {
      process.env.BELLDANDY_STATE_DIR = originalStateDir;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should normalize workshop category aliases", () => {
    expect(normalizeWorkshopCategory("技能")).toBe("skills");
    expect(normalizeWorkshopCategory("方法论")).toBe("methods");
    expect(normalizeWorkshopCategory("模组")).toBe("plugins");
    expect(normalizeWorkshopCategory("apps")).toBe("apps");
  });

  it("should search workshop with normalized category and auth headers", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      items: [{ id: "item-1", title: "测试技能" }],
      total: 1,
      page: 1,
      limit: 5,
    }));

    const result = await officeWorkshopSearchTool.execute(
      { agent_name: "贝露丹蒂", category: "技能", limit: 5 },
      context,
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/workshop/items?category=skills&limit=5");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("gro_test_key");
    expect((init.headers as Record<string, string>)["X-Agent-ID"]).toBe(encodeURIComponent("贝露丹蒂"));
  });

  it("should resolve default Belldandy alias to 贝露丹蒂 config", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      items: [{ id: "item-1", title: "测试技能" }],
      total: 1,
      page: 1,
      limit: 5,
    }));

    const result = await officeWorkshopSearchTool.execute(
      { agent_name: "Belldandy", category: "技能", limit: 5 },
      context,
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("gro_test_key");
    expect((init.headers as Record<string, string>)["X-Agent-ID"]).toBe(encodeURIComponent("贝露丹蒂"));
  });

  it("should download workshop file into target directory", async () => {
    const content = Buffer.from("hello office");
    const expectedHash = crypto.createHash("sha256").update(content).digest("hex");

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: "item-1",
        title: "下载测试",
        fileName: "demo.txt",
        fileHash: expectedHash,
      }))
      .mockResolvedValueOnce(new Response(content, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      }));

    const result = await officeWorkshopDownloadTool.execute(
      { agent_name: "贝露丹蒂", item_id: "item-1", target_dir: "downloads", overwrite: true },
      context,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output);
    expect(output.hashMatched).toBe(true);

    const saved = await fs.readFile(path.join(tempDir, "downloads", "demo.txt"), "utf-8");
    expect(saved).toBe("hello office");
  });

  it("should use configured office downloadDir when target_dir is omitted", async () => {
    const content = Buffer.from("configured download dir");
    await fs.writeFile(
      path.join(stateDir, "community.json"),
      JSON.stringify({
        endpoint: "http://office.test",
        agents: [
          {
            name: "贝露丹蒂",
            apiKey: "gro_test_key",
            office: {
              downloadDir: "agent-downloads",
            },
          },
        ],
      }, null, 2),
      "utf-8",
    );

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: "item-2",
        title: "默认下载目录测试",
        fileName: "configured.txt",
        fileHash: null,
      }))
      .mockResolvedValueOnce(new Response(content, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      }));

    const result = await officeWorkshopDownloadTool.execute(
      { agent_name: "贝露丹蒂", item_id: "item-2", overwrite: true },
      context,
    );

    expect(result.success).toBe(true);
    const saved = await fs.readFile(path.join(tempDir, "agent-downloads", "configured.txt"), "utf-8");
    expect(saved).toBe("configured download dir");
  });

  it("should block publish when file path escapes workspace", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-office-outside-"));
    const outsideFile = path.join(outsideDir, "secret.yml");
    await fs.writeFile(outsideFile, "secret", "utf-8");

    try {
      const result = await officeWorkshopPublishTool.execute(
        {
          agent_name: "贝露丹蒂",
          category: "methods",
          title: "越界发布",
          summary: "summary",
          description: "description",
          file_path: outsideFile,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("越界");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("should allow publish from configured office uploadRoots outside workspace", async () => {
    const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-office-upload-root-"));
    const uploadFile = path.join(uploadRoot, "publish.json");
    await fs.writeFile(uploadFile, "{\"name\":\"demo\"}", "utf-8");
    await fs.writeFile(
      path.join(stateDir, "community.json"),
      JSON.stringify({
        endpoint: "http://office.test",
        agents: [
          {
            name: "贝露丹蒂",
            apiKey: "gro_test_key",
            office: {
              uploadRoots: [uploadRoot],
            },
          },
        ],
      }, null, 2),
      "utf-8",
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "item-upload-1", message: "发布成功" }, 201));

    try {
      const result = await officeWorkshopPublishTool.execute(
        {
          agent_name: "贝露丹蒂",
          category: "skills",
          title: "上传白名单测试",
          summary: "summary",
          description: "description",
          file_path: uploadFile,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://office.test/api/workshop/items");
      expect(init.method).toBe("POST");
    } finally {
      await fs.rm(uploadRoot, { recursive: true, force: true });
    }
  });

  it("should publish workshop file successfully", async () => {
    const sampleFile = path.join(tempDir, "publish.yml");
    const manifestFile = path.join(tempDir, "manifest.json");
    await fs.writeFile(sampleFile, "name: publish-test", "utf-8");
    await fs.writeFile(manifestFile, JSON.stringify({ app: "demo" }), "utf-8");

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "new-item", message: "发布成功" }));

    const result = await officeWorkshopPublishTool.execute(
      {
        agent_name: "贝露丹蒂",
        category: "应用",
        title: "发布测试",
        summary: "summary",
        description: "description",
        file_path: sampleFile,
        manifest_path: manifestFile,
        app_run_type: "download",
      },
      context,
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/workshop/items");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("gro_test_key");
  });

  it("should read my homestead successfully", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      homestead: { id: "a10001", name: "我的家园" },
      placedItems: [],
      inventoryItems: [],
    }));

    const result = await officeHomesteadGetTool.execute({ agent_name: "贝露丹蒂" }, context);

    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/town-square/my-homestead");
  });

  it("should place homestead item with correct payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      message: "放置成功",
      prosperity: 10,
      placedItems: [{ inventoryId: 1 }],
      inventoryItems: [],
    }));

    const result = await officeHomesteadPlaceTool.execute(
      { agent_name: "贝露丹蒂", inventory_id: 7, x: 2, y: -1 },
      context,
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/town-square/place");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ inventoryId: 7, x: 2, y: -1 }));
  });

  it("should list my workshop items", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ id: "mine-1", title: "我的作品" }] }));

    const result = await officeWorkshopMineTool.execute({ agent_name: "贝露丹蒂" }, context);

    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/workshop/mine");
  });

  it("should reject workshop update without changed fields", async () => {
    const result = await officeWorkshopUpdateTool.execute(
      { agent_name: "贝露丹蒂", item_id: "item-1" },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("至少提供一个要更新的字段");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should update workshop item with correct payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "更新成功" }));

    const result = await officeWorkshopUpdateTool.execute(
      { agent_name: "贝露丹蒂", item_id: "item-1", title: "新标题", tags: ["a", "b"] },
      context,
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/workshop/items/item-1");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ title: "新标题", tags: ["a", "b"] }));
  });

  it("should delete workshop item", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "删除成功" }));

    const result = await officeWorkshopDeleteTool.execute(
      { agent_name: "贝露丹蒂", item_id: "item-1" },
      context,
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/workshop/items/item-1");
    expect(init.method).toBe("DELETE");
  });

  it("should mount homestead item with correct payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "挂载成功", prosperity: 12, placedItems: [], inventoryItems: [] }));

    const result = await officeHomesteadMountTool.execute(
      { agent_name: "贝露丹蒂", inventory_id: 7, host_inventory_id: 8, offset_x: 12, offset_y: 6 },
      context,
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/town-square/mount");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ inventoryId: 7, hostInventoryId: 8, offsetX: 12, offsetY: 6 }));
  });

  it("should unmount homestead item", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "已取消挂载", prosperity: 8, placedItems: [], inventoryItems: [] }));

    const result = await officeHomesteadUnmountTool.execute(
      { agent_name: "贝露丹蒂", inventory_id: 9 },
      context,
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/town-square/unmount");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ inventoryId: 9 }));
  });

  it("should open blind box", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "开启成功", rewards: [{ itemId: 1, count: 1 }], inventoryItems: [] }));

    const result = await officeHomesteadOpenBlindBoxTool.execute(
      { agent_name: "贝露丹蒂", inventory_id: 11 },
      context,
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://office.test/api/town-square/open-blind-box");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ inventoryId: 11 }));
  });
});
