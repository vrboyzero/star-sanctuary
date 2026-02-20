/**
 * Workspace 引导文件名常量
 */
export declare const SOUL_FILENAME = "SOUL.md";
export declare const IDENTITY_FILENAME = "IDENTITY.md";
export declare const USER_FILENAME = "USER.md";
export declare const BOOTSTRAP_FILENAME = "BOOTSTRAP.md";
export declare const AGENTS_FILENAME = "AGENTS.md";
export declare const TOOLS_FILENAME = "TOOLS.md";
export declare const HEARTBEAT_FILENAME = "HEARTBEAT.md";
export declare const MEMORY_FILENAME = "MEMORY.md";
/**
 * Workspace 文件类型
 */
export type WorkspaceFileName = typeof SOUL_FILENAME | typeof IDENTITY_FILENAME | typeof USER_FILENAME | typeof BOOTSTRAP_FILENAME | typeof AGENTS_FILENAME | typeof TOOLS_FILENAME | typeof HEARTBEAT_FILENAME | typeof MEMORY_FILENAME;
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
/**
 * 确保 Workspace 目录存在，并创建缺失的模板文件
 *
 * @param dir Workspace 目录路径（如 ~/.belldandy）
 * @param createMissing 是否创建缺失的模板文件
 * @returns 创建结果
 */
export declare function ensureWorkspace(params: {
    dir: string;
    createMissing?: boolean;
}): Promise<{
    dir: string;
    created: WorkspaceFileName[];
    isBrandNew: boolean;
}>;
/**
 * 检查是否是首次使用（需要 Bootstrap）
 *
 * 判断条件：BOOTSTRAP.md 存在 或 IDENTITY.md 不存在
 */
export declare function needsBootstrap(dir: string): Promise<boolean>;
/**
 * 创建 Bootstrap 引导文件（仅首次使用）
 */
export declare function createBootstrapFile(dir: string): Promise<boolean>;
/**
 * 删除 Bootstrap 文件（引导完成后调用）
 */
export declare function removeBootstrapFile(dir: string): Promise<boolean>;
/**
 * 加载 Workspace 中的所有引导文件
 */
export declare function loadWorkspaceFiles(dir: string): Promise<WorkspaceLoadResult>;
/**
 * 确保 Agent 专属 workspace 目录存在。
 * 创建 ~/.belldandy/agents/{agentId}/ 和 facets/ 子目录。
 */
export declare function ensureAgentWorkspace(params: {
    rootDir: string;
    agentId: string;
}): Promise<{
    agentDir: string;
    created: boolean;
}>;
/**
 * 加载 Agent 专属 workspace 文件（带 fallback 到根目录）。
 *
 * 对每个可继承文件：优先从 agents/{agentId}/ 读取，不存在则 fallback 到 rootDir。
 * 默认 Agent（id="default"）直接委托 loadWorkspaceFiles(rootDir)。
 */
export declare function loadAgentWorkspaceFiles(rootDir: string, agentId: string): Promise<WorkspaceLoadResult>;
/**
 * 身份信息结构
 */
export type IdentityInfo = {
    agentName?: string;
    agentAvatar?: string;
    userName?: string;
    userAvatar?: string;
};
/**
 * 从 IDENTITY.md 和 USER.md 中提取身份信息
 *
 * 解析规则：
 * - IDENTITY.md: 查找 "**名字：**"、"**Emoji：**"、"**头像：**" 行
 * - USER.md: 查找 "**名字：**" 行
 * - 优先级：头像 > Emoji（如果两者都存在，使用头像）
 */
export declare function extractIdentityInfo(dir: string): Promise<IdentityInfo>;
//# sourceMappingURL=workspace.d.ts.map