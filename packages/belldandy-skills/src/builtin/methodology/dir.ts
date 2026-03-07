import type { ToolContext } from "../../types.js";
import * as os from "node:os";
import * as path from "node:path";

const asciiMethodFilenameRegex = /^[A-Za-z0-9_]+-[A-Za-z0-9_]+(-[A-Za-z0-9_]+)?\.md$/;
const hasHanCharacterRegex = /\p{Script=Han}/u;
const invalidFilenameCharsRegex = /[<>:"/\\|?*\u0000-\u001F]/;

export function resolveStateDir(context?: Pick<ToolContext, "workspaceRoot">, env: NodeJS.ProcessEnv = process.env): string {
    const workspaceRoot = context?.workspaceRoot?.trim();
    if (workspaceRoot) {
        return workspaceRoot;
    }

    const stateDir = env.BELLDANDY_STATE_DIR?.trim();
    if (stateDir) {
        return stateDir;
    }

    return path.join(os.homedir(), ".belldandy");
}

export function resolveMethodsDir(context?: Pick<ToolContext, "workspaceRoot">, env: NodeJS.ProcessEnv = process.env): string {
    return path.join(resolveStateDir(context, env), "methods");
}

export function isValidMethodFilename(filename: string): boolean {
    if (asciiMethodFilenameRegex.test(filename)) {
        return true;
    }

    if (filename !== filename.trim() || !filename.endsWith(".md")) {
        return false;
    }

    const basename = filename.slice(0, -3);
    if (!basename || basename === "." || basename === "..") {
        return false;
    }

    if (invalidFilenameCharsRegex.test(filename)) {
        return false;
    }

    if (basename.startsWith(".") || /[. ]$/.test(basename)) {
        return false;
    }

    return hasHanCharacterRegex.test(basename);
}
