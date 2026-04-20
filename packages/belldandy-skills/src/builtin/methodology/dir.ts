import type { ToolContext } from "../../types.js";
import * as path from "node:path";
import { resolveStateDir as resolveDefaultStateDir } from "@belldandy/protocol";

const canonicalMethodFilenameRegex = /^[A-Za-z0-9_\p{Script=Han}]+-[A-Za-z0-9_\p{Script=Han}]+-[A-Za-z0-9_\p{Script=Han}]+\.md$/u;

export function resolveStateDir(context?: Pick<ToolContext, "workspaceRoot">, env: NodeJS.ProcessEnv = process.env): string {
    const workspaceRoot = context?.workspaceRoot?.trim();
    if (workspaceRoot) {
        return workspaceRoot;
    }
    return resolveDefaultStateDir(env);
}

export function resolveMethodsDir(context?: Pick<ToolContext, "workspaceRoot">, env: NodeJS.ProcessEnv = process.env): string {
    return path.join(resolveStateDir(context, env), "methods");
}

export function isValidMethodFilename(filename: string): boolean {
    const normalized = String(filename ?? "").trim();
    if (normalized !== filename) {
        return false;
    }
    return canonicalMethodFilenameRegex.test(normalized);
}
