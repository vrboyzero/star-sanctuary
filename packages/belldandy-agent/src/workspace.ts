import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Workspace 引导文件名常量
 */
export const SOUL_FILENAME = "SOUL.md";
export const IDENTITY_FILENAME = "IDENTITY.md";
export const USER_FILENAME = "USER.md";
export const BOOTSTRAP_FILENAME = "BOOTSTRAP.md";
export const AGENTS_FILENAME = "AGENTS.md";
export const TOOLS_FILENAME = "TOOLS.md";
export const HEARTBEAT_FILENAME = "HEARTBEAT.md";
export const MEMORY_FILENAME = "MEMORY.md";

/**
 * Workspace 文件类型
 */
export type WorkspaceFileName =
    | typeof SOUL_FILENAME
    | typeof IDENTITY_FILENAME
    | typeof USER_FILENAME
    | typeof BOOTSTRAP_FILENAME
    | typeof AGENTS_FILENAME
    | typeof TOOLS_FILENAME
    | typeof HEARTBEAT_FILENAME
    | typeof MEMORY_FILENAME;

/**
 * Workspace 文件结构
 */
export type WorkspaceFile = {
    name: WorkspaceFileName;
    path: string;
    content?: string;
    missing: boolean;
};

/**
 * Workspace 加载结果
 */
export type WorkspaceLoadResult = {
    dir: string;
    files: WorkspaceFile[];
    hasSoul: boolean;
    hasIdentity: boolean;
    hasUser: boolean;
    hasBootstrap: boolean;
    hasAgents: boolean;
    hasTools: boolean;
    hasHeartbeat: boolean;
    hasMemory: boolean;
};

// 模板目录（相对于此文件）
const TEMPLATE_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "templates"
);

/**
 * 加载模板文件内容
 */
async function loadTemplate(name: string): Promise<string> {
    const templatePath = path.join(TEMPLATE_DIR, name);
    try {
        return await fs.readFile(templatePath, "utf-8");
    } catch {
        throw new Error(
            `Missing workspace template: ${name} (${templatePath}). Ensure templates are packaged.`
        );
    }
}

/**
 * 如果文件不存在则写入（不覆盖已有）
 */
async function writeFileIfMissing(filePath: string, content: string): Promise<boolean> {
    try {
        await fs.writeFile(filePath, content, {
            encoding: "utf-8",
            flag: "wx", // 仅当文件不存在时创建
        });
        return true; // 文件已创建
    } catch (err) {
        const anyErr = err as { code?: string };
        if (anyErr.code === "EEXIST") {
            return false; // 文件已存在
        }
        throw err;
    }
}

/**
 * 确保 Workspace 目录存在，并创建缺失的模板文件
 *
 * @param dir Workspace 目录路径（如 ~/.belldandy）
 * @param createMissing 是否创建缺失的模板文件
 * @returns 创建结果
 */
export async function ensureWorkspace(params: {
    dir: string;
    createMissing?: boolean;
}): Promise<{
    dir: string;
    created: WorkspaceFileName[];
    isBrandNew: boolean;
}> {
    const { dir, createMissing = true } = params;

    // 确保目录存在
    await fs.mkdir(dir, { recursive: true });

    const created: WorkspaceFileName[] = [];

    if (!createMissing) {
        return { dir, created, isBrandNew: false };
    }

    // 所有需要创建的文件（除了 BOOTSTRAP）
    const coreFiles: WorkspaceFileName[] = [
        AGENTS_FILENAME,
        SOUL_FILENAME,
        TOOLS_FILENAME,
        IDENTITY_FILENAME,
        USER_FILENAME,
        USER_FILENAME,
        HEARTBEAT_FILENAME,
        // MEMORY.md is optional and not created by default unless explicitly requested (not in coreFiles for creation check usually, or add here if we want empty one)
        // For now, let's include it in coreFiles so ensureWorkspace checks it, but maybe we don't want to force create it if it doesn't exist?
        // The user request said "at the beginning there might not be MEMORY.md", so we should NOT force create it here.
        // Removing from coreFiles for creation to avoid error if template is missing or to avoid forcing it.
        // Actually, let's NOT include it in coreFiles for creation to respect "optional" nature.
    ];

    // 检查是否是全新工作区（所有核心文件都不存在）
    const existenceChecks = await Promise.all(
        coreFiles.map(async (fileName) => {
            try {
                await fs.access(path.join(dir, fileName));
                return true;
            } catch {
                return false;
            }
        })
    );
    const isBrandNew = existenceChecks.every((exists) => !exists);

    // 创建核心文件
    for (const fileName of coreFiles) {
        const filePath = path.join(dir, fileName);
        const template = await loadTemplate(fileName);
        const wasCreated = await writeFileIfMissing(filePath, template);
        if (wasCreated) {
            created.push(fileName);
        }
    }

    // BOOTSTRAP.md 只在全新工作区时创建
    if (isBrandNew) {
        const bootstrapPath = path.join(dir, BOOTSTRAP_FILENAME);
        const bootstrapTemplate = await loadTemplate(BOOTSTRAP_FILENAME);
        const wasCreated = await writeFileIfMissing(bootstrapPath, bootstrapTemplate);
        if (wasCreated) {
            created.push(BOOTSTRAP_FILENAME);
        }
    }

    return { dir, created, isBrandNew };
}

/**
 * 检查是否是首次使用（需要 Bootstrap）
 *
 * 判断条件：BOOTSTRAP.md 存在 或 IDENTITY.md 不存在
 */
export async function needsBootstrap(dir: string): Promise<boolean> {
    const bootstrapPath = path.join(dir, BOOTSTRAP_FILENAME);
    const identityPath = path.join(dir, IDENTITY_FILENAME);

    // 如果 BOOTSTRAP.md 存在，则需要引导
    try {
        await fs.access(bootstrapPath);
        return true;
    } catch {
        // BOOTSTRAP.md 不存在
    }

    // 如果 IDENTITY.md 也不存在，说明是全新工作区
    try {
        await fs.access(identityPath);
        return false; // IDENTITY.md 存在，不需要引导
    } catch {
        return true; // IDENTITY.md 不存在，需要引导
    }
}

/**
 * 创建 Bootstrap 引导文件（仅首次使用）
 */
export async function createBootstrapFile(dir: string): Promise<boolean> {
    const filePath = path.join(dir, BOOTSTRAP_FILENAME);
    const template = await loadTemplate(BOOTSTRAP_FILENAME);
    return await writeFileIfMissing(filePath, template);
}

/**
 * 删除 Bootstrap 文件（引导完成后调用）
 */
export async function removeBootstrapFile(dir: string): Promise<boolean> {
    const filePath = path.join(dir, BOOTSTRAP_FILENAME);
    try {
        await fs.unlink(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * 加载 Workspace 中的所有引导文件
 */
export async function loadWorkspaceFiles(dir: string): Promise<WorkspaceLoadResult> {
    const fileNames: WorkspaceFileName[] = [
        AGENTS_FILENAME,
        SOUL_FILENAME,
        TOOLS_FILENAME,
        IDENTITY_FILENAME,
        USER_FILENAME,
        HEARTBEAT_FILENAME,
        BOOTSTRAP_FILENAME,
        MEMORY_FILENAME,
    ];

    const files: WorkspaceFile[] = [];

    for (const name of fileNames) {
        const filePath = path.join(dir, name);
        try {
            const content = await fs.readFile(filePath, "utf-8");
            files.push({
                name,
                path: filePath,
                content,
                missing: false,
            });
        } catch {
            files.push({
                name,
                path: filePath,
                missing: true,
            });
        }
    }

    const hasSoul = files.some(f => f.name === SOUL_FILENAME && !f.missing);
    const hasIdentity = files.some(f => f.name === IDENTITY_FILENAME && !f.missing);
    const hasUser = files.some(f => f.name === USER_FILENAME && !f.missing);
    const hasBootstrap = files.some(f => f.name === BOOTSTRAP_FILENAME && !f.missing);
    const hasAgents = files.some(f => f.name === AGENTS_FILENAME && !f.missing);
    const hasTools = files.some(f => f.name === TOOLS_FILENAME && !f.missing);
    const hasHeartbeat = files.some(f => f.name === HEARTBEAT_FILENAME && !f.missing);
    const hasMemory = files.some(f => f.name === MEMORY_FILENAME && !f.missing);

    return {
        dir,
        files,
        hasSoul,
        hasIdentity,
        hasUser,
        hasBootstrap,
        hasAgents,
        hasTools,
        hasHeartbeat,
        hasMemory,
    };
}

/**
 * Per-Agent workspace 中可继承的文件列表（不含 BOOTSTRAP / HEARTBEAT）
 */
const INHERITABLE_FILES: WorkspaceFileName[] = [
    SOUL_FILENAME,
    IDENTITY_FILENAME,
    USER_FILENAME,
    AGENTS_FILENAME,
    TOOLS_FILENAME,
    MEMORY_FILENAME,
];

/**
 * 确保 Agent 专属 workspace 目录存在。
 * 创建 ~/.belldandy/agents/{agentId}/ 和 facets/ 子目录。
 */
export async function ensureAgentWorkspace(params: {
    rootDir: string;
    agentId: string;
}): Promise<{ agentDir: string; created: boolean }> {
    const { rootDir, agentId } = params;
    const agentDir = path.join(rootDir, "agents", agentId);
    const facetsDir = path.join(agentDir, "facets");

    let created = false;
    try {
        await fs.access(agentDir);
    } catch {
        created = true;
    }

    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(facetsDir, { recursive: true });

    return { agentDir, created };
}

/**
 * 加载 Agent 专属 workspace 文件（带 fallback 到根目录）。
 *
 * 对每个可继承文件：优先从 agents/{agentId}/ 读取，不存在则 fallback 到 rootDir。
 * 默认 Agent（id="default"）直接委托 loadWorkspaceFiles(rootDir)。
 */
export async function loadAgentWorkspaceFiles(
    rootDir: string,
    agentId: string,
): Promise<WorkspaceLoadResult> {
    // default agent 不走 agents/ 子目录
    if (!agentId || agentId === "default") {
        return loadWorkspaceFiles(rootDir);
    }

    const agentDir = path.join(rootDir, "agents", agentId);
    const files: WorkspaceFile[] = [];

    for (const name of INHERITABLE_FILES) {
        const agentFilePath = path.join(agentDir, name);
        const rootFilePath = path.join(rootDir, name);

        // 优先 agent 目录
        let resolved = false;
        for (const filePath of [agentFilePath, rootFilePath]) {
            try {
                const content = await fs.readFile(filePath, "utf-8");
                files.push({ name, path: filePath, content, missing: false });
                resolved = true;
                break;
            } catch {
                // try next
            }
        }
        if (!resolved) {
            files.push({ name, path: agentFilePath, missing: true });
        }
    }

    const hasSoul = files.some(f => f.name === SOUL_FILENAME && !f.missing);
    const hasIdentity = files.some(f => f.name === IDENTITY_FILENAME && !f.missing);
    const hasUser = files.some(f => f.name === USER_FILENAME && !f.missing);
    const hasBootstrap = false; // agent workspace 不使用 bootstrap
    const hasAgents = files.some(f => f.name === AGENTS_FILENAME && !f.missing);
    const hasTools = files.some(f => f.name === TOOLS_FILENAME && !f.missing);
    const hasHeartbeat = false; // agent workspace 不使用 heartbeat
    const hasMemory = files.some(f => f.name === MEMORY_FILENAME && !f.missing);

    return {
        dir: agentDir,
        files,
        hasSoul,
        hasIdentity,
        hasUser,
        hasBootstrap,
        hasAgents,
        hasTools,
        hasHeartbeat,
        hasMemory,
    };
}
