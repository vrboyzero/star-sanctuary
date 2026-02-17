import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fileReadTool, fileWriteTool } from "./file.js";
import type { ToolContext } from "../types.js";

describe("file tools", () => {
  let tempDir: string;
  let baseContext: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    baseContext = {
      conversationId: "test-conv",
      workspaceRoot: tempDir,
      policy: {
        allowedPaths: [],
        deniedPaths: [".git", "node_modules"],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5000,
        maxResponseBytes: 1024,
      },
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("file_read", () => {
    it("should read existing file", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "Hello, Belldandy!", "utf-8");

      const result = await fileReadTool.execute({ path: "test.txt" }, baseContext);

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.content).toBe("Hello, Belldandy!");
      expect(output.path).toBe("test.txt");
    });

    it("should return error for non-existent file", async () => {
      const result = await fileReadTool.execute({ path: "not-exist.txt" }, baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("不存在");
    });

    it("should block path traversal", async () => {
      const result = await fileReadTool.execute({ path: "../../../etc/passwd" }, baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("越界");
    });

    it("should block absolute paths", async () => {
      const result = await fileReadTool.execute({ path: "/etc/passwd" }, baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("越界");
    });

    it("should block sensitive files (.env)", async () => {
      const envFile = path.join(tempDir, ".env");
      await fs.writeFile(envFile, "SECRET=123", "utf-8");

      const result = await fileReadTool.execute({ path: ".env" }, baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("敏感文件");
    });

    it("should block sensitive files (credentials)", async () => {
      await fs.mkdir(path.join(tempDir, "config"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "config", "credentials.json"), "{}", "utf-8");

      const result = await fileReadTool.execute({ path: "config/credentials.json" }, baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("敏感文件");
    });

    it("should block denied paths (.git)", async () => {
      await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
      await fs.writeFile(path.join(tempDir, ".git", "config"), "test", "utf-8");

      const result = await fileReadTool.execute({ path: ".git/config" }, baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("禁止访问");
    });

    it("should truncate large files", async () => {
      const largeContent = "x".repeat(200 * 1024); // 200KB
      await fs.writeFile(path.join(tempDir, "large.txt"), largeContent, "utf-8");

      const result = await fileReadTool.execute(
        { path: "large.txt", maxBytes: 1024 },
        baseContext
      );

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.truncated).toBe(true);
      expect(output.bytesRead).toBe(1024);
    });

    it("should read nested files", async () => {
      await fs.mkdir(path.join(tempDir, "a", "b", "c"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "a", "b", "c", "deep.txt"), "deep content", "utf-8");

      const result = await fileReadTool.execute({ path: "a/b/c/deep.txt" }, baseContext);

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.content).toBe("deep content");
    });
  });

  describe("file_write", () => {
    it("should write new file", async () => {
      const result = await fileWriteTool.execute(
        { path: "output.txt", content: "Hello, World!" },
        baseContext
      );

      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(tempDir, "output.txt"), "utf-8");
      expect(content).toBe("Hello, World!");
    });

    it("should overwrite existing file", async () => {
      await fs.writeFile(path.join(tempDir, "existing.txt"), "old content", "utf-8");

      const result = await fileWriteTool.execute(
        { path: "existing.txt", content: "new content" },
        baseContext
      );

      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(tempDir, "existing.txt"), "utf-8");
      expect(content).toBe("new content");
    });

    it("should append to file", async () => {
      await fs.writeFile(path.join(tempDir, "append.txt"), "line1\n", "utf-8");

      const result = await fileWriteTool.execute(
        { path: "append.txt", content: "line2\n", mode: "append" },
        baseContext
      );

      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(tempDir, "append.txt"), "utf-8");
      expect(content).toBe("line1\nline2\n");
    });

    it("should create parent directories", async () => {
      const result = await fileWriteTool.execute(
        { path: "new/nested/dir/file.txt", content: "nested!" },
        baseContext
      );

      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(tempDir, "new/nested/dir/file.txt"), "utf-8");
      expect(content).toBe("nested!");
    });

    it("should block path traversal", async () => {
      const result = await fileWriteTool.execute(
        { path: "../outside.txt", content: "malicious" },
        baseContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("越界");
    });

    it("should block sensitive paths", async () => {
      const result = await fileWriteTool.execute(
        { path: ".env.local", content: "SECRET=hack" },
        baseContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("敏感文件");
    });

    it("should enforce allowedPaths whitelist", async () => {
      const restrictedContext: ToolContext = {
        ...baseContext,
        policy: {
          ...baseContext.policy,
          allowedPaths: ["output", "tmp"],
        },
      };

      // 不在白名单中
      const result1 = await fileWriteTool.execute(
        { path: "forbidden/file.txt", content: "test" },
        restrictedContext
      );
      expect(result1.success).toBe(false);
      expect(result1.error).toContain("白名单");

      // 在白名单中
      const result2 = await fileWriteTool.execute(
        { path: "output/file.txt", content: "allowed" },
        restrictedContext
      );
      expect(result2.success).toBe(true);
    });

    it("should block denied paths", async () => {
      const result = await fileWriteTool.execute(
        { path: "node_modules/malicious.js", content: "bad code" },
        baseContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("禁止写入");
    });
  });

  describe("tool definitions", () => {
    it("file_read should have correct definition", () => {
      expect(fileReadTool.definition.name).toBe("file_read");
      expect(fileReadTool.definition.parameters.required).toContain("path");
    });

    it("file_write should have correct definition", () => {
      expect(fileWriteTool.definition.name).toBe("file_write");
      expect(fileWriteTool.definition.parameters.required).toContain("path");
      expect(fileWriteTool.definition.parameters.required).toContain("content");
    });
  });
});
