import path from "node:path";
import type fs from "node:fs";
import fsp from "node:fs/promises";

import type { GatewayResFrame } from "@belldandy/protocol";

import { QueryRuntime, type QueryRuntimeObserver } from "./query-runtime.js";
import { matchResidentProtectedStatePath } from "./resident-state-binding.js";

type WorkspaceQueryRuntimeMethod =
  | "workspace.list"
  | "workspace.read"
  | "workspace.readSource"
  | "workspace.write";

type WorkspaceListItem = {
  name: string;
  type: "file" | "directory";
  path: string;
};

type WorkspaceStatIfExists = (targetPath: string) => Promise<fs.Stats | null>;
type WorkspaceIsUnderRoot = (root: string, target: string) => boolean;
type WorkspaceWriteTextFileAtomic = (
  filePath: string,
  content: string,
  options?: { ensureParent?: boolean; mode?: number },
) => Promise<void>;

export type QueryRuntimeWorkspaceContext = {
  requestId: string;
  stateDir: string;
  additionalWorkspaceRoots: string[];
  statIfExists: WorkspaceStatIfExists;
  isUnderRoot: WorkspaceIsUnderRoot;
  writeTextFileAtomic: WorkspaceWriteTextFileAtomic;
  guardTeamSharedMemoryWrite?: (input: {
    stateDir: string;
    relativePath: string;
    content: string;
  }) => {
    applies: boolean;
    ok: boolean;
    code?: string;
    message?: string;
  };
  runtimeObserver?: QueryRuntimeObserver<WorkspaceQueryRuntimeMethod>;
};

const WORKSPACE_ALLOWED_EXTENSIONS = [".md", ".json", ".txt"];
const WORKSPACE_READABLE_TEXT_EXTENSIONS = [
  ".md", ".txt", ".json", ".jsonl", ".log", ".csv",
  ".js", ".jsx", ".ts", ".tsx", ".mts", ".cts",
  ".css", ".scss", ".less", ".html", ".xml",
  ".yml", ".yaml", ".toml", ".ini",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".cs",
  ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd",
];
const WORKSPACE_IGNORED_NAMES = ["generated", "memory.db", ".DS_Store", "node_modules"];
const WORKSPACE_SENSITIVE_FILES = ["allowlist.json", "pairing.json", "channel-security.json", "channel-security-approvals.json", "channel-reply-chunking.json", "mcp.json", "feishu-state.json"];

export async function handleWorkspaceListWithQueryRuntime(
  ctx: QueryRuntimeWorkspaceContext,
  params: { path?: string },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "workspace.list" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    const relativePath = params.path ?? "";
    queryRuntime.mark("request_validated", {
      detail: {
        relativePath,
      },
    });

    const targetDir = path.resolve(ctx.stateDir, relativePath);
    queryRuntime.mark("workspace_target_resolved", {
      detail: {
        relativePath,
        targetPath: targetDir,
      },
    });

    if (!ctx.isUnderRoot(ctx.stateDir, targetDir)) {
      queryRuntime.mark("completed", {
        detail: {
          relativePath,
          code: "invalid_path",
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "invalid_path", message: "路径越界" } };
    }

    try {
      const stat = await ctx.statIfExists(targetDir);
      if (!stat?.isDirectory()) {
        queryRuntime.mark("completed", {
          detail: {
            relativePath,
            code: "not_found",
          },
        });
        return { type: "res", id: ctx.requestId, ok: false, error: { code: "not_found", message: "目录不存在" } };
      }

      const entries = await fsp.readdir(targetDir, { withFileTypes: true });
      const items: WorkspaceListItem[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith(".") && relativePath !== "") continue;
        if (WORKSPACE_IGNORED_NAMES.includes(entry.name)) continue;

        const itemRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          items.push({ name: entry.name, type: "directory", path: itemRelPath });
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (WORKSPACE_ALLOWED_EXTENSIONS.includes(ext)) {
            items.push({ name: entry.name, type: "file", path: itemRelPath });
          }
        }
      }

      items.sort((left, right) => {
        if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
        return left.name.localeCompare(right.name);
      });

      queryRuntime.mark("workspace_listed", {
        detail: {
          relativePath,
          count: items.length,
        },
      });
      queryRuntime.mark("completed", {
        detail: {
          relativePath,
          count: items.length,
        },
      });

      return { type: "res", id: ctx.requestId, ok: true, payload: { items } };
    } catch (error) {
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "read_failed", message: String(error) } };
    }
  });
}

export async function handleWorkspaceReadWithQueryRuntime(
  ctx: QueryRuntimeWorkspaceContext,
  params: { path: string },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "workspace.read" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("request_validated", {
      detail: {
        relativePath: params.path,
      },
    });

    const targetFile = path.resolve(ctx.stateDir, params.path);
    queryRuntime.mark("workspace_target_resolved", {
      detail: {
        relativePath: params.path,
        targetPath: targetFile,
      },
    });

    if (!ctx.isUnderRoot(ctx.stateDir, targetFile)) {
      queryRuntime.mark("completed", {
        detail: {
          relativePath: params.path,
          code: "invalid_path",
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "invalid_path", message: "路径越界" } };
    }

    const ext = path.extname(targetFile).toLowerCase();
    if (!WORKSPACE_ALLOWED_EXTENSIONS.includes(ext)) {
      queryRuntime.mark("completed", {
        detail: {
          relativePath: params.path,
          code: "invalid_type",
          ext,
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "invalid_type", message: "不支持的文件类型" } };
    }

    if (WORKSPACE_SENSITIVE_FILES.includes(path.basename(params.path).toLowerCase())) {
      queryRuntime.mark("completed", {
        detail: {
          relativePath: params.path,
          code: "forbidden",
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "forbidden", message: "禁止访问内部状态文件" } };
    }

    try {
      const stat = await ctx.statIfExists(targetFile);
      if (!stat?.isFile()) {
        queryRuntime.mark("completed", {
          detail: {
            relativePath: params.path,
            code: "not_found",
          },
        });
        return { type: "res", id: ctx.requestId, ok: false, error: { code: "not_found", message: "文件不存在" } };
      }
      const content = await fsp.readFile(targetFile, "utf-8");
      queryRuntime.mark("workspace_read", {
        detail: {
          relativePath: params.path,
          contentChars: content.length,
        },
      });
      queryRuntime.mark("completed", {
        detail: {
          relativePath: params.path,
        },
      });
      return { type: "res", id: ctx.requestId, ok: true, payload: { content, path: params.path } };
    } catch (error) {
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "read_failed", message: String(error) } };
    }
  });
}

export async function handleWorkspaceReadSourceWithQueryRuntime(
  ctx: QueryRuntimeWorkspaceContext,
  params: { path: string },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "workspace.readSource" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("request_validated", {
      detail: {
        requestedPath: params.path,
        isAbsolute: path.isAbsolute(params.path),
      },
    });

    const targetFile = path.isAbsolute(params.path)
      ? path.resolve(params.path)
      : path.resolve(ctx.stateDir, params.path);
    queryRuntime.mark("workspace_target_resolved", {
      detail: {
        requestedPath: params.path,
        targetPath: targetFile,
      },
    });

    const allowedRoots = [ctx.stateDir, ...ctx.additionalWorkspaceRoots];
    if (!allowedRoots.some((root) => ctx.isUnderRoot(root, targetFile))) {
      queryRuntime.mark("completed", {
        detail: {
          requestedPath: params.path,
          code: "invalid_path",
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "invalid_path", message: "路径越界" } };
    }

    const ext = path.extname(targetFile).toLowerCase();
    if (!WORKSPACE_READABLE_TEXT_EXTENSIONS.includes(ext)) {
      queryRuntime.mark("completed", {
        detail: {
          requestedPath: params.path,
          code: "invalid_type",
          ext,
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "invalid_type", message: "不支持的源文件类型" } };
    }

    try {
      const stat = await ctx.statIfExists(targetFile);
      if (!stat?.isFile()) {
        queryRuntime.mark("completed", {
          detail: {
            requestedPath: params.path,
            code: "not_found",
          },
        });
        return { type: "res", id: ctx.requestId, ok: false, error: { code: "not_found", message: "文件不存在" } };
      }
      const content = await fsp.readFile(targetFile, "utf-8");
      queryRuntime.mark("workspace_source_read", {
        detail: {
          requestedPath: params.path,
          targetPath: targetFile,
          contentChars: content.length,
        },
      });
      queryRuntime.mark("completed", {
        detail: {
          requestedPath: params.path,
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: true,
        payload: {
          content,
          path: targetFile,
          readOnly: true,
        },
      };
    } catch (error) {
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "read_failed", message: String(error) } };
    }
  });
}

export async function handleWorkspaceWriteWithQueryRuntime(
  ctx: QueryRuntimeWorkspaceContext,
  params: { path: string; content: string },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "workspace.write" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("request_validated", {
      detail: {
        relativePath: params.path,
        contentChars: params.content.length,
      },
    });

    const targetFile = path.resolve(ctx.stateDir, params.path);
    queryRuntime.mark("workspace_target_resolved", {
      detail: {
        relativePath: params.path,
        targetPath: targetFile,
      },
    });

    if (!ctx.isUnderRoot(ctx.stateDir, targetFile)) {
      queryRuntime.mark("completed", {
        detail: {
          relativePath: params.path,
          code: "invalid_path",
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "invalid_path", message: "路径越界" } };
    }

    const ext = path.extname(targetFile).toLowerCase();
    if (!WORKSPACE_ALLOWED_EXTENSIONS.includes(ext)) {
      queryRuntime.mark("completed", {
        detail: {
          relativePath: params.path,
          code: "invalid_type",
          ext,
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "invalid_type", message: "不支持的文件类型" } };
    }

    try {
      if (WORKSPACE_SENSITIVE_FILES.includes(path.basename(params.path).toLowerCase())) {
        queryRuntime.mark("completed", {
          detail: {
            relativePath: params.path,
            code: "forbidden",
            reason: "internal_state_file",
          },
        });
        return {
          type: "res",
          id: ctx.requestId,
          ok: false,
          error: { code: "forbidden", message: "禁止修改内部状态文件" },
        };
      }

      const teamSharedMemoryGuard = ctx.guardTeamSharedMemoryWrite?.({
        stateDir: ctx.stateDir,
        relativePath: params.path,
        content: params.content,
      });
      if (teamSharedMemoryGuard?.applies && !teamSharedMemoryGuard.ok) {
        queryRuntime.mark("completed", {
          detail: {
            relativePath: params.path,
            code: teamSharedMemoryGuard.code ?? "forbidden",
          },
        });
        return {
          type: "res",
          id: ctx.requestId,
          ok: false,
          error: {
            code: teamSharedMemoryGuard.code ?? "forbidden",
            message: teamSharedMemoryGuard.message ?? "共享记忆写入被安全策略阻止",
          },
        };
      }

      const protectedResidentStatePath = matchResidentProtectedStatePath(params.path);
      if (protectedResidentStatePath) {
        queryRuntime.mark("completed", {
          detail: {
            relativePath: params.path,
            code: "protected_state_scope",
            residentStateScope: protectedResidentStatePath.summary,
          },
        });
        return {
          type: "res",
          id: ctx.requestId,
          ok: false,
          error: {
            code: "protected_state_scope",
            message: `禁止通过 workspace.write 直接修改 ${protectedResidentStatePath.summary}。请改用 resident memory / shared review / 会话等专用出口。`,
          },
        };
      }

      await ctx.writeTextFileAtomic(targetFile, params.content, { ensureParent: true, mode: 0o700 });
      queryRuntime.mark("workspace_written", {
        detail: {
          relativePath: params.path,
          contentChars: params.content.length,
        },
      });
      queryRuntime.mark("completed", {
        detail: {
          relativePath: params.path,
        },
      });
      return { type: "res", id: ctx.requestId, ok: true, payload: { path: params.path } };
    } catch (error) {
      return { type: "res", id: ctx.requestId, ok: false, error: { code: "write_failed", message: String(error) } };
    }
  });
}
