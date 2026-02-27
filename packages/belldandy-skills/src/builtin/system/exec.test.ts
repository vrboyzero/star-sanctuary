import { describe, it, expect, vi } from "vitest";
import { runCommandTool } from "./exec.js";
import type { ToolContext } from "../../types.js";

const mockContext: ToolContext = {
    conversationId: "test-conv",
    workspaceRoot: "/tmp/test-workspace",
    policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 1000,
        maxResponseBytes: 1024,
    },
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
    },
};

const isWindows = process.platform === "win32";

describe("run_command (Platform-aware Safelist)", () => {
    // 通用命令测试（所有平台）
    it("should allow common 'pwd' command on all platforms", async () => {
        const result = await runCommandTool.execute({ command: "pwd" }, mockContext);
        // 即使执行失败，也不应该是安全错误
        if (!result.success) {
            expect(result.error).not.toContain("blocked by security policy");
            expect(result.error).not.toContain("not in the safe list");
        }
    });

    it("should allow common 'git' command on all platforms", async () => {
        const result = await runCommandTool.execute({ command: "git --version" }, mockContext);
        if (!result.success) {
            expect(result.error).not.toContain("not in the safe list");
        }
    });

    // Windows 特定命令测试
    describe("Windows-specific commands", () => {
        it("should handle 'copy' based on platform", async () => {
            const result = await runCommandTool.execute({ command: "copy a.txt b.txt" }, mockContext);
            if (isWindows) {
                // Windows: 应该被允许（可能因文件不存在而失败，但不是安全错误）
                if (!result.success) {
                    expect(result.error).not.toContain("not in the safe list");
                }
            } else {
                // Unix: 应该被安全阻止
                expect(result.success).toBe(false);
                expect(result.error).toContain("not in the safe list");
            }
        });

        it("should handle 'ipconfig' based on platform", async () => {
            const result = await runCommandTool.execute({ command: "ipconfig" }, mockContext);
            if (isWindows) {
                if (!result.success) {
                    expect(result.error).not.toContain("not in the safe list");
                }
            } else {
                expect(result.success).toBe(false);
                expect(result.error).toContain("not in the safe list");
            }
        });
    });

    // Unix 特定命令测试
    describe("Unix-specific commands", () => {
        it("should handle 'ls' based on platform", async () => {
            const result = await runCommandTool.execute({ command: "ls" }, mockContext);
            if (!result.success) {
                expect(result.error).not.toContain("not in the safe list");
            }
        });

        it("should handle 'curl' based on platform", async () => {
            const result = await runCommandTool.execute({ command: "curl --version" }, mockContext);
            if (!result.success) {
                expect(result.error).not.toContain("not in the safe list");
            }
        });
    });

    // 危险参数检测（Windows del）
    describe("Dangerous argument detection", () => {
        it("should block 'del /s' on Windows (recursive blocked)", async () => {
            // 这个测试只在 Windows 上有意义，因为 del 只在 Windows 白名单中
            if (isWindows) {
                const result = await runCommandTool.execute({ command: "del /s *.log" }, mockContext);
                expect(result.success).toBe(false);
                expect(result.error).toContain("Recursive/Quiet deletion");
            }
        });

        it("should block 'del /q' on Windows (quiet blocked)", async () => {
            if (isWindows) {
                const result = await runCommandTool.execute({ command: "del /q *.log" }, mockContext);
                expect(result.success).toBe(false);
                expect(result.error).toContain("Recursive/Quiet deletion");
            }
        });

        it("should block 'rm -rf' on Unix (recursive blocked)", async () => {
            // rm 在所有平台都检测危险参数
            const result = await runCommandTool.execute({ command: "rm -rf /tmp" }, mockContext);
            expect(result.success).toBe(false);
            expect(result.error).toContain("Recursive/Force deletion");
        });

        it("should validate chained commands segment-by-segment", async () => {
            const result = await runCommandTool.execute({ command: "echo ok && rm -rf ./tmp" }, mockContext);
            expect(result.success).toBe(false);
            expect(result.error).toContain("Recursive/Force deletion");
        });

        it("should block shell redirection syntax", async () => {
            const result = await runCommandTool.execute({ command: "echo test > out.txt" }, mockContext);
            expect(result.success).toBe(false);
            expect(result.error).toContain("Redirection syntax is blocked");
        });

        it("should block cwd outside workspace root", async () => {
            const result = await runCommandTool.execute({ command: "pwd", cwd: "../outside" }, mockContext);
            expect(result.success).toBe(false);
            expect(result.error).toContain("Working directory escapes workspace root");
        });
    });
});
