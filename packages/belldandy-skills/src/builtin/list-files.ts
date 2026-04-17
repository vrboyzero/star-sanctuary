import crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext, ToolCallResult } from "../types.js";
import { withToolContract } from "../tool-contract.js";
import { resolveRuntimeFilesystemScope } from "../runtime-policy.js";
import { isAbortError, readAbortReason, throwIfAborted } from "../abort-utils.js";

/** 检查路径是否在黑名单中 */
function isDeniedPath(relativePath: string, deniedPaths: string[]): string | null {
    const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
    for (const denied of deniedPaths) {
        const deniedNorm = denied.replace(/\\/g, "/").toLowerCase();
        if (normalized.includes(deniedNorm)) {
            return denied;
        }
    }
    return null;
}

/** 检查路径是否在指定根目录下（不越界） */
function isUnderRoot(absolute: string, root: string): { ok: true; relative: string } | { ok: false } {
    const resolvedRoot = path.resolve(root);
    const rel = path.relative(resolvedRoot, absolute);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false };
    return { ok: true, relative: rel.replace(/\\/g, "/") };
}

/** 规范化并验证路径在工作区内（主工作区或 extraWorkspaceRoots 中的任一根目录下）；返回匹配的根目录供列目录时计算相对路径用 */
function resolveAndValidatePath(
    pathArg: string,
    workspaceRoot: string,
    extraWorkspaceRoots?: string[]
): { ok: true; absolute: string; relative: string; effectiveRoot: string } | { ok: false; error: string } {
    const trimmed = (pathArg || "").trim();
    if (!trimmed) {
        return { ok: false, error: "路径不能为空" };
    }

    const normalized = trimmed.replace(/\\/g, "/");
    const mainRoot = path.resolve(workspaceRoot);

    let absolute: string;
    if (path.isAbsolute(normalized) || (trimmed.length >= 2 && /^[A-Za-z]:/.test(trimmed))) {
        absolute = path.resolve(normalized);
    } else {
        absolute = path.resolve(mainRoot, normalized);
    }

    const underMain = isUnderRoot(absolute, mainRoot);
    if (underMain.ok) {
        return { ok: true, absolute, relative: underMain.relative, effectiveRoot: mainRoot };
    }
    if (extraWorkspaceRoots?.length) {
        for (const extra of extraWorkspaceRoots) {
            const resolvedExtra = path.resolve(extra);
            const underExtra = isUnderRoot(absolute, resolvedExtra);
            if (underExtra.ok) {
                return { ok: true, absolute, relative: underExtra.relative, effectiveRoot: resolvedExtra };
            }
        }
    }

    return { ok: false, error: "路径越界：不允许访问工作区外的目录" };
}

// ============ list_files 工具 ============

type FileEntry = {
    name: string;
    path: string;
    type: "file" | "directory";
    size?: number;
};

async function listDirectory(
    dir: string,
    workspaceRoot: string,
    recursive: boolean,
    maxDepth: number,
    currentDepth: number,
    entries: FileEntry[],
    signal?: AbortSignal,
): Promise<void> {
    if (currentDepth > maxDepth) return;
    throwIfAborted(signal);

    try {
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (const item of items) {
            throwIfAborted(signal);
            const fullPath = path.join(dir, item.name);
            const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, "/");

            if (item.isDirectory()) {
                entries.push({
                    name: item.name,
                    path: relativePath,
                    type: "directory",
                });

                if (recursive && currentDepth < maxDepth) {
                    await listDirectory(
                        fullPath,
                        workspaceRoot,
                        recursive,
                        maxDepth,
                        currentDepth + 1,
                        entries,
                        signal,
                    );
                }
            } else if (item.isFile()) {
                try {
                    const stat = await fs.stat(fullPath);
                    entries.push({
                        name: item.name,
                        path: relativePath,
                        type: "file",
                        size: stat.size,
                    });
                } catch {
                    // 忽略无法访问的文件
                    entries.push({
                        name: item.name,
                        path: relativePath,
                        type: "file",
                    });
                }
            }
        }
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }
        // 忽略无法访问的目录
    }
}

export const listFilesTool: Tool = withToolContract({
    definition: {
        name: "list_files",
        description:
            "列出工作区内或 BELLDANDY_EXTRA_WORKSPACE_ROOTS 配置的根目录下指定目录的文件和子目录。path 可为相对路径（相对主工作区）或允许范围内的绝对路径（如 C:/、E:/ 下的路径）。",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "目录路径：相对主工作区的相对路径，或允许的绝对路径如 C:/Users、E:/project（默认为 '.' 即主工作区根）",
                },
                recursive: {
                    type: "boolean",
                    description: "是否递归列出子目录内容（默认 false）",
                },
                depth: {
                    type: "number",
                    description: "递归深度限制（默认 3，最大 10）",
                },
            },
            required: [],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "list_files";

        const makeError = (error: string): ToolCallResult => ({
            id,
            name,
            success: false,
            output: "",
            error,
            durationMs: Date.now() - start,
        });

        // 参数处理
        const pathArg = typeof args.path === "string" && args.path.trim() ? args.path.trim() : ".";
        const recursive = args.recursive === true;
        const depth = typeof args.depth === "number" && args.depth > 0
            ? Math.min(args.depth, 10)
            : 3;

        // 路径验证（主工作区或 extraWorkspaceRoots 下的目录均可）
        const scope = resolveRuntimeFilesystemScope(context);
        const pathResult = resolveAndValidatePath(pathArg, scope.workspaceRoot, scope.extraWorkspaceRoots);
        if (!pathResult.ok) {
            return makeError(pathResult.error);
        }

        const { absolute, relative, effectiveRoot } = pathResult;

        // 黑名单检查
        const denied = isDeniedPath(relative, context.policy.deniedPaths);
        if (denied) {
            return makeError(`禁止访问路径：${denied}`);
        }

        try {
            throwIfAborted(context.abortSignal);
            const stat = await fs.stat(absolute);

            if (!stat.isDirectory()) {
                return makeError(`路径不是目录：${relative}`);
            }

            const entries: FileEntry[] = [];
            await listDirectory(
                absolute,
                effectiveRoot,
                recursive,
                depth,
                1,
                entries,
                context.abortSignal,
            );

            // 按类型和名称排序
            entries.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === "directory" ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            return {
                id,
                name,
                success: true,
                output: JSON.stringify({
                    path: relative || ".",
                    totalEntries: entries.length,
                    recursive,
                    depth,
                    entries,
                }),
                durationMs: Date.now() - start,
            };
        } catch (err) {
            if (isAbortError(err)) {
                return makeError(readAbortReason(context.abortSignal));
            }
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "ENOENT") {
                return makeError(`目录不存在：${relative}`);
            }
            if (code === "EACCES") {
                return makeError(`无权访问目录：${relative}`);
            }
            return makeError(err instanceof Error ? err.message : String(err));
        }
    },
}, {
    family: "workspace-read",
    isReadOnly: true,
    isConcurrencySafe: true,
    needsPermission: false,
    riskLevel: "low",
    channels: ["gateway", "web"],
    safeScopes: ["local-safe", "web-safe"],
    activityDescription: "List files and directories inside the workspace",
    resultSchema: {
        kind: "json",
        description: "Directory listing payload encoded as JSON text.",
    },
    outputPersistencePolicy: "conversation",
});
