import crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolCallResult, ToolContext } from "../../types.js";
import { parsePatchText } from "./dsl.js";
import { applyUpdateChunks } from "./match.js";
import { withToolContract } from "../../tool-contract.js";
import { resolveRuntimeFilesystemScope } from "../../runtime-policy.js";

// ============ Helper Functions ============

/** 敏感文件模式（禁止修改） */
const SENSITIVE_PATTERNS = [
    ".env",
    ".env.local",
    ".env.production",
    "credentials",
    "secret",
    ".key",
    ".pem",
    ".p12",
    ".pfx",
    "id_rsa",
    "id_ed25519",
    ".ssh",
    "password",
    "token",
];

/** 检查路径是否包含敏感文件模式 */
function isSensitivePath(relativePath: string): boolean {
    const lower = relativePath.toLowerCase();
    return SENSITIVE_PATTERNS.some(p => lower.includes(p));
}

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

function isAllowedPath(relativePath: string, allowedPaths: string[]): boolean {
    if (allowedPaths.length === 0) return true;
    const normalizedRelative = relativePath.replace(/\\/g, "/").toLowerCase();
    return allowedPaths.some((entry) => {
        const normalizedAllowed = entry.replace(/\\/g, "/").toLowerCase();
        if (normalizedAllowed === ".") return true;
        return normalizedRelative.startsWith(normalizedAllowed + "/") || normalizedRelative === normalizedAllowed;
    });
}

function isUnderRoot(absolute: string, root: string): { ok: true; relative: string } | { ok: false } {
    const resolvedRoot = path.resolve(root);
    const rel = path.relative(resolvedRoot, absolute);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false };
    return { ok: true, relative: rel.replace(/\\/g, "/") };
}

/** 规范化并验证路径在工作区内（主工作区或 extraWorkspaceRoots 中的任一根目录下） */
function resolveAndValidatePath(
    pathArg: string,
    workspaceRoot: string,
    extraWorkspaceRoots?: string[],
): { ok: true; absolute: string; relative: string } | { ok: false; error: string } {
    const trimmed = (pathArg || "").trim();
    if (!trimmed) {
        return { ok: false, error: "路径不能为空" };
    }

    const normalized = trimmed.replace(/\\/g, "/");
    const mainRoot = path.resolve(workspaceRoot);

    const absolute = path.isAbsolute(normalized) || (trimmed.length >= 2 && /^[A-Za-z]:/.test(trimmed))
        ? path.resolve(normalized)
        : path.resolve(mainRoot, normalized);

    const underMain = isUnderRoot(absolute, mainRoot);
    if (underMain.ok) {
        return { ok: true, absolute, relative: underMain.relative };
    }

    for (const extraRoot of extraWorkspaceRoots ?? []) {
        const underExtra = isUnderRoot(absolute, path.resolve(extraRoot));
        if (underExtra.ok) {
            return { ok: true, absolute, relative: underExtra.relative };
        }
    }

    return { ok: false, error: "路径越界：不允许访问工作区外的文件" };
}

function validateWritablePath(
    pathArg: string,
    context: ToolContext,
): { ok: true; absolute: string; relative: string } | { ok: false; error: string } {
    const scope = resolveRuntimeFilesystemScope(context);
    const resolved = resolveAndValidatePath(pathArg, scope.workspaceRoot, scope.extraWorkspaceRoots);
    if (!resolved.ok) return resolved;

    if (isSensitivePath(resolved.relative)) {
        return { ok: false, error: `[${resolved.relative}] 禁止修改敏感文件` };
    }

    const denied = isDeniedPath(resolved.relative, context.policy.deniedPaths);
    if (denied) {
        return { ok: false, error: `[${resolved.relative}] 禁止修改路径：${denied}` };
    }

    if (!isAllowedPath(resolved.relative, context.policy.allowedPaths)) {
        return { ok: false, error: `[${resolved.relative}] 路径不在写入白名单中` };
    }

    return resolved;
}

async function ensureDir(filePath: string) {
    const parent = path.dirname(filePath);
    if (!parent || parent === ".") return;
    await fs.mkdir(parent, { recursive: true });
}

// ============ apply_patch Tool ============

export const applyPatchTool: Tool = withToolContract({
    definition: {
        name: "apply_patch",
        description:
            "使用 Unified Diff 变体格式（基于 Blocks）修改一个或多个文件。支持在一次调用中执行添加、删除、更新和移动操作。**这是修改代码的首选方式**。",
        parameters: {
            type: "object",
            properties: {
                input: {
                    type: "string",
                    description: "包含 *** Begin Patch 和 *** End Patch 标记的完整补丁内容",
                },
            },
            required: ["input"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "apply_patch";

        const makeError = (error: string): ToolCallResult => ({
            id,
            name,
            success: false,
            output: "",
            error,
            durationMs: Date.now() - start,
        });

        // 参数校验
        const inputArg = args.input;
        if (typeof inputArg !== "string" || !inputArg.trim()) {
            return makeError("参数错误：input 必须是非空字符串");
        }

        try {
            // 1. 解析 Patch DSL
            const parsed = parsePatchText(inputArg);
            if (parsed.hunks.length === 0) {
                return makeError("未找到任何修改（No Hunks found）");
            }

            const summary = {
                added: [] as string[],
                modified: [] as string[],
                deleted: [] as string[],
            };
            const seen = {
                added: new Set<string>(),
                modified: new Set<string>(),
                deleted: new Set<string>(),
            };

            const recordSummary = (bucket: keyof typeof summary, file: string) => {
                if (seen[bucket].has(file)) return;
                seen[bucket].add(file);
                summary[bucket].push(file);
            };

            // 2. 依次应用 Hunks
            // 注意：这里没有像 Moltbot 一样支持 AbortSignal，因为 execute 本身是原子的
            for (const hunk of parsed.hunks) {
                const pathCheck = validateWritablePath(hunk.path, context);
                if (!pathCheck.ok) throw new Error(pathCheck.error);
                const { absolute, relative } = pathCheck;

                if (hunk.kind === "add") {
                    await ensureDir(absolute);
                    await fs.writeFile(absolute, hunk.contents, "utf8");
                    recordSummary("added", relative);
                    continue;
                }

                if (hunk.kind === "delete") {
                    await fs.rm(absolute, { force: true });
                    recordSummary("deleted", relative);
                    continue;
                }

                if (hunk.kind === "update") {
                    // 应用 Update Chunks
                    const newContent = await applyUpdateChunks(absolute, hunk.chunks);

                    if (hunk.movePath) {
                        // 移动文件逻辑
                        const moveCheck = validateWritablePath(hunk.movePath, context);
                        if (!moveCheck.ok) throw new Error(moveCheck.error);

                        await ensureDir(moveCheck.absolute);
                        await fs.writeFile(moveCheck.absolute, newContent, "utf8");
                        await fs.rm(absolute, { force: true }); // 删除旧文件
                        recordSummary("modified", `${relative} -> ${moveCheck.relative}`);
                    } else {
                        // 原地更新
                        await fs.writeFile(absolute, newContent, "utf8");
                        recordSummary("modified", relative);
                    }
                }
            }

            return {
                id,
                name,
                success: true,
                output: JSON.stringify({
                    summary,
                    details: "Patch applied successfully",
                }),
                durationMs: Date.now() - start,
            };

        } catch (err) {
            return makeError(err instanceof Error ? err.message : String(err));
        }
    },
}, {
    family: "patch",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: "high",
    channels: ["gateway", "web"],
    safeScopes: ["privileged"],
    activityDescription: "Apply a structured patch to one or more workspace files",
    resultSchema: {
        kind: "json",
        description: "Patch application summary encoded as JSON text.",
    },
    outputPersistencePolicy: "artifact",
});
