import type { AgentPromptDelta } from "./prompt-snapshot.js";
import type { WorkspaceDocumentFrontmatter, WorkspaceFile, WorkspaceLoadResult } from "./workspace.js";
import {
    SOUL_FILENAME,
    IDENTITY_FILENAME,
    USER_FILENAME,
    BOOTSTRAP_FILENAME,
    AGENTS_FILENAME,
    TOOLS_FILENAME,
    MEMORY_FILENAME,
    getWorkspaceDocumentBody,
} from "./workspace.js";

/**
 * System Prompt 构建参数
 */
export type SystemPromptParams = {
    /** Workspace 加载结果 */
    workspace?: WorkspaceLoadResult;
    /** 额外的 system prompt（叠加在 Workspace 内容之后） */
    extraSystemPrompt?: string;
    /** 用户时区 */
    userTimezone?: string;
    /** 当前时间 */
    currentTime?: string;
    /** 是否注入 AGENTS.md (默认 true) */
    injectAgents?: boolean;
    /** 是否注入 SOUL.md (默认 true) */
    injectSoul?: boolean;
    /** 是否注入 MEMORY.md (默认 true) */
    injectMemory?: boolean;
    /** 最大字符数限制，超过则按优先级截断低优先级段落（0 或 undefined 表示不限制） */
    maxChars?: number;
    /** 需要直接注入 system prompt 的 skill 指令列表（high/always priority） */
    skillInstructions?: Array<{ name: string; instructions: string }>;
    /** 是否有更多按需 skills 可通过 skills_search 搜索 */
    hasSearchableSkills?: boolean;
    /** 是否支持UUID验证（告知Agent当前环境是否支持UUID） */
    supportsUuid?: boolean;
    /** 用户UUID（如果有） */
    userUuid?: string;
    /** 运行时动态拼装的 prompt sections */
    runtimeSections?: SystemPromptSection[];
    /** 可选：覆盖指定 section 的 priority，影响排序与截断顺序 */
    sectionPriorityOverrides?: Record<string, number>;
};

export type SystemPromptSectionSource =
    | "core"
    | "workspace"
    | "memory"
    | "skills"
    | "bootstrap"
    | "context"
    | "extra"
    | "methodology"
    | "workspace-dir"
    | "runtime"
    | "profile"
    | "meta";

export type SystemPromptSection = {
    id: string;
    label: string;
    source: SystemPromptSectionSource;
    priority: number;
    text: string;
    sourceFile?: string;
    summary?: string;
    readWhen?: string[];
    layer?: string;
    cacheHint?: string;
    role?: string;
};

export type SystemPromptBuildResult = {
    text: string;
    sections: SystemPromptSection[];
    droppedSections: SystemPromptSection[];
    truncated: boolean;
    truncationReason?: {
        code: "max_chars_limit";
        maxChars: number;
        droppedSectionCount: number;
        droppedSectionIds: string[];
        droppedSectionLabels: string[];
        message: string;
    };
    maxChars?: number;
    totalChars: number;
    finalChars: number;
};

export type ProviderNativeSystemBlockType =
    | "static-persona"
    | "static-capability"
    | "dynamic-runtime";

export type ProviderNativeSystemBlock = {
    id: string;
    blockType: ProviderNativeSystemBlockType;
    text: string;
    sourceSectionIds: string[];
    sourceDeltaIds: string[];
    cacheControlEligible: boolean;
};

function createSection(input: Omit<SystemPromptSection, "priority"> & { priority: number }): SystemPromptSection {
    return {
        id: input.id,
        label: input.label,
        source: input.source,
        priority: input.priority,
        text: input.text,
        sourceFile: input.sourceFile,
        summary: input.summary,
        readWhen: input.readWhen,
        layer: input.layer,
        cacheHint: input.cacheHint,
        role: input.role,
    };
}

function getSectionMetadataFromWorkspaceFile(file: WorkspaceFile | undefined): Partial<SystemPromptSection> {
    const frontmatter: WorkspaceDocumentFrontmatter | undefined = file?.document?.frontmatter;
    return {
        sourceFile: file?.path,
        summary: frontmatter?.summary,
        readWhen: frontmatter?.readWhen,
        layer: frontmatter?.layer,
        cacheHint: frontmatter?.cache,
        role: frontmatter?.role,
    };
}

function applySectionPriorityOverrides(
    sections: SystemPromptSection[],
    overrides?: Record<string, number>,
): SystemPromptSection[] {
    if (!overrides || Object.keys(overrides).length === 0) {
        return [...sections];
    }

    return sections.map((section) => ({
        ...section,
        priority: Object.prototype.hasOwnProperty.call(overrides, section.id)
            ? overrides[section.id]!
            : section.priority,
    }));
}

function sortSectionsByPriority(
    sections: SystemPromptSection[],
): SystemPromptSection[] {
    return sections
        .map((section, index) => ({ section, index }))
        .sort((left, right) => {
            const priorityDiff = left.section.priority - right.section.priority;
            if (priorityDiff !== 0) {
                return priorityDiff;
            }
            return left.index - right.index;
        })
        .map((entry) => entry.section);
}

function getWorkspacePromptBody(file: WorkspaceFile | undefined): string | undefined {
    const body = file ? getWorkspaceDocumentBody(file) : undefined;
    const normalized = body?.trim();
    return normalized ? normalized : undefined;
}

function classifyProviderNativeSystemSection(section: SystemPromptSection): ProviderNativeSystemBlockType {
    switch (section.id) {
        case "core":
        case "workspace-agents":
        case "workspace-soul":
        case "workspace-user":
        case "workspace-identity":
        case "workspace-memory":
        case "workspace-bootstrap":
            return "static-persona";
        default:
            break;
    }

    switch (section.source) {
        case "runtime":
        case "profile":
        case "meta":
            return "dynamic-runtime";
        default:
            return "static-capability";
    }
}

function buildProviderNativeSystemBlock(input: {
    id: string;
    blockType: ProviderNativeSystemBlockType;
    texts: string[];
    sourceSectionIds?: string[];
    sourceDeltaIds?: string[];
}): ProviderNativeSystemBlock | undefined {
    const text = input.texts
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join("\n")
        .trim();
    if (!text) {
        return undefined;
    }

    return {
        id: input.id,
        blockType: input.blockType,
        text,
        sourceSectionIds: input.sourceSectionIds ?? [],
        sourceDeltaIds: input.sourceDeltaIds ?? [],
        cacheControlEligible: input.blockType !== "dynamic-runtime",
    };
}

export function renderSystemPromptSections(sections: SystemPromptSection[]): string {
    return sections.map((section) => section.text).join("\n").trim();
}

export function buildProviderNativeSystemBlocks(input: {
    sections?: SystemPromptSection[];
    deltas?: AgentPromptDelta[];
    fallbackText?: string;
}): ProviderNativeSystemBlock[] {
    const sections = input.sections ?? [];
    const systemDeltas = (input.deltas ?? [])
        .filter((delta) => delta.role === "system" && delta.text.trim());

    if (sections.length === 0) {
        const blocks: ProviderNativeSystemBlock[] = [];
        const fallbackBlock = buildProviderNativeSystemBlock({
            id: "provider-native-static-capability",
            blockType: "static-capability",
            texts: input.fallbackText ? [input.fallbackText] : [],
        });
        if (fallbackBlock) {
            blocks.push(fallbackBlock);
        }
        const runtimeBlock = buildProviderNativeSystemBlock({
            id: "provider-native-dynamic-runtime",
            blockType: "dynamic-runtime",
            texts: systemDeltas.map((delta) => delta.text),
            sourceDeltaIds: systemDeltas.map((delta) => delta.id),
        });
        if (runtimeBlock) {
            blocks.push(runtimeBlock);
        }
        return blocks;
    }

    const personaSections = sections.filter((section) => classifyProviderNativeSystemSection(section) === "static-persona");
    const capabilitySections = sections.filter((section) => classifyProviderNativeSystemSection(section) === "static-capability");
    const runtimeSections = sections.filter((section) => classifyProviderNativeSystemSection(section) === "dynamic-runtime");

    const blocks = [
        buildProviderNativeSystemBlock({
            id: "provider-native-static-persona",
            blockType: "static-persona",
            texts: personaSections.map((section) => section.text),
            sourceSectionIds: personaSections.map((section) => section.id),
        }),
        buildProviderNativeSystemBlock({
            id: "provider-native-static-capability",
            blockType: "static-capability",
            texts: capabilitySections.map((section) => section.text),
            sourceSectionIds: capabilitySections.map((section) => section.id),
        }),
        buildProviderNativeSystemBlock({
            id: "provider-native-dynamic-runtime",
            blockType: "dynamic-runtime",
            texts: [
                ...runtimeSections.map((section) => section.text),
                ...systemDeltas.map((delta) => delta.text),
            ],
            sourceSectionIds: runtimeSections.map((section) => section.id),
            sourceDeltaIds: systemDeltas.map((delta) => delta.id),
        }),
    ].filter(Boolean) as ProviderNativeSystemBlock[];

    if (blocks.length > 0) {
        return blocks;
    }

    const fallbackBlock = buildProviderNativeSystemBlock({
        id: "provider-native-static-capability",
        blockType: "static-capability",
        texts: input.fallbackText ? [input.fallbackText] : [],
    });
    return fallbackBlock ? [fallbackBlock] : [];
}

/**
 * 构建完整的 System Prompt
 *
 * 将 Workspace 引导文件内容注入 system prompt，使 Agent 具有人格化特征。
 *
 * 注入顺序：
 * 1. 核心身份声明
 * 2. AGENTS.md（工作空间指南，包含连续性/记忆系统说明）
 * 3. SOUL.md（人格准则）
 * 4. USER.md（用户档案）
 * 5. IDENTITY.md（身份信息）
 * 6. TOOLS.md（工具说明）
 * 7. MEMORY.md（核心记忆）
 * 8. Skills（技能指令注入）
 * 9. BOOTSTRAP.md（首次引导，如有）
 * 10. 时间信息
 * 11. 额外 system prompt
 * 12. Methodology 系统协议
 */
export function buildSystemPromptResult(params: SystemPromptParams): SystemPromptBuildResult {
    const maxChars = params.maxChars && params.maxChars > 0 ? params.maxChars : 0;

    const workspace = params.workspace;
    const files = workspace?.files ?? [];

    // 查找各文件
    const agentsFile = files.find(f => f.name === AGENTS_FILENAME && !f.missing);
    const soulFile = files.find(f => f.name === SOUL_FILENAME && !f.missing);
    const toolsFile = files.find(f => f.name === TOOLS_FILENAME && !f.missing);
    const identityFile = files.find(f => f.name === IDENTITY_FILENAME && !f.missing);
    const userFile = files.find(f => f.name === USER_FILENAME && !f.missing);
    const bootstrapFile = files.find(f => f.name === BOOTSTRAP_FILENAME && !f.missing);
    const memoryFile = files.find(f => f.name === MEMORY_FILENAME && !f.missing);
    const agentsContent = getWorkspacePromptBody(agentsFile);
    const soulContent = getWorkspacePromptBody(soulFile);
    const toolsContent = getWorkspacePromptBody(toolsFile);
    const identityContent = getWorkspacePromptBody(identityFile);
    const userContent = getWorkspacePromptBody(userFile);
    const bootstrapContent = getWorkspacePromptBody(bootstrapFile);
    const memoryContent = getWorkspacePromptBody(memoryFile);

    const shouldInjectAgents = params.injectAgents ?? true;
    const shouldInjectSoul = params.injectSoul ?? true;
    const shouldInjectMemory = params.injectMemory ?? true;

    // 按优先级构建段落列表（高优先级在前）
    // 截断时从末尾开始丢弃
    const sections: SystemPromptSection[] = [];

    // P0: 核心身份声明（始终保留）
    sections.push(createSection({
        id: "core",
        label: "core",
        source: "core",
        priority: 0,
        text: "You are Belldandy, a personal AI assistant running locally on your user's device.\n",
    }));

    // P1: AGENTS.md（工作空间指南）
    if (shouldInjectAgents && agentsContent) {
        sections.push(createSection({
            id: "workspace-agents",
            label: "AGENTS.md",
            source: "workspace",
            priority: 10,
            text: [
                "# Workspace Guide",
                "",
                "The following is your workspace guide - how to operate in this environment.",
                "",
                "---",
                "",
                agentsContent,
                "",
                "---",
                "",
            ].join("\n"),
            ...getSectionMetadataFromWorkspaceFile(agentsFile),
        }));
    }

    // P2: SOUL.md（人格准则）
    if (shouldInjectSoul && soulContent) {
        sections.push(createSection({
            id: "workspace-soul",
            label: "SOUL.md",
            source: "workspace",
            priority: 20,
            text: [
                "# Persona & Guidelines",
                "",
                "The following is your SOUL - your core personality and behavioral guidelines.",
                "Embody its persona and tone. Avoid stiff, generic replies; follow its guidance.",
                "",
                "---",
                "",
                soulContent,
                "",
                "---",
                "",
            ].join("\n"),
            ...getSectionMetadataFromWorkspaceFile(soulFile),
        }));
    }

    // P3: USER.md
    if (userContent) {
        sections.push(createSection({
            id: "workspace-user",
            label: "USER.md",
            source: "workspace",
            priority: 30,
            text: [
                "# Your User",
                "",
                "The following describes the person you are helping:",
                "",
                userContent,
                "",
            ].join("\n"),
            ...getSectionMetadataFromWorkspaceFile(userFile),
        }));
    }

    // P4: IDENTITY.md
    if (identityContent) {
        sections.push(createSection({
            id: "workspace-identity",
            label: "IDENTITY.md",
            source: "workspace",
            priority: 40,
            text: [
                "# Your Identity",
                "",
                "The following describes who you are:",
                "",
                identityContent,
                "",
            ].join("\n"),
            ...getSectionMetadataFromWorkspaceFile(identityFile),
        }));
    }

    // P5: TOOLS.md
    if (toolsContent) {
        sections.push(createSection({
            id: "workspace-tools",
            label: "TOOLS.md",
            source: "workspace",
            priority: 50,
            text: [
                "# Tools & Local Setup",
                "",
                "The following contains local tool configuration and environment-specific notes:",
                "",
                toolsContent,
                "",
            ].join("\n"),
            ...getSectionMetadataFromWorkspaceFile(toolsFile),
        }));
    }

    for (const runtimeSection of params.runtimeSections ?? []) {
        if (!runtimeSection.text.trim()) {
            continue;
        }
        sections.push(createSection(runtimeSection));
    }

    // P6: MEMORY.md
    if (shouldInjectMemory && memoryContent) {
        sections.push(createSection({
            id: "workspace-memory",
            label: "MEMORY.md",
            source: "memory",
            priority: 60,
            text: [
                "# Core Memory & Notes",
                "",
                "The following is your MEMORY - important facts, rules, or context to always remember.",
                "",
                "---",
                "",
                memoryContent,
                "",
                "---",
                "",
            ].join("\n"),
            ...getSectionMetadataFromWorkspaceFile(memoryFile),
        }));
    }

    // P7: Skills（技能指令注入）
    if (params.skillInstructions && params.skillInstructions.length > 0) {
        const SKILL_CHAR_LIMIT = 4000;
        const skillLines: string[] = ["# Active Skills", ""];

        let totalChars = 0;
        let injectedFull = false;
        for (const skill of params.skillInstructions) {
            if (totalChars + skill.instructions.length <= SKILL_CHAR_LIMIT) {
                skillLines.push(`## [${skill.name}]`, "", skill.instructions.trim(), "");
                totalChars += skill.instructions.length;
                injectedFull = true;
            } else {
                // 超过阈值，降级为摘要
                skillLines.push(`- **${skill.name}**: (use skills_search to view full instructions)`);
            }
        }

        if (params.hasSearchableSkills) {
            skillLines.push(
                "",
                "你有更多专业技能存储在技能库中。当遇到不熟悉的领域时，请使用 skills_search 工具搜索可用技能；当你决定采用某个 skill 时，优先调用 skill_get 精确打开。",
                "注意：仅搜索不算已使用；skill_get 会在当前 task 存在时自动记录 skill usage。若通过其他入口实际采用了 method 或 skill，再调用 experience_usage_record 补记。若误记了 usage，可用 experience_usage_revoke 撤销当前 task 的记录。",
                "",
            );
        }

        if (injectedFull || params.hasSearchableSkills) {
            sections.push(createSection({
                id: "skills",
                label: "skills",
                source: "skills",
                priority: 70,
                text: skillLines.join("\n"),
            }));
        }
    } else if (params.hasSearchableSkills) {
        sections.push(createSection({
            id: "skills",
            label: "skills",
            source: "skills",
            priority: 70,
            text: [
                "# Skills",
                "",
                "你有专业技能存储在技能库中。当遇到不熟悉的领域时，请使用 skills_search 工具搜索可用技能；当你决定采用某个 skill 时，优先调用 skill_get 精确打开。",
                "注意：仅搜索不算已使用；skill_get 会在当前 task 存在时自动记录 skill usage。若通过其他入口实际采用了 method 或 skill，再调用 experience_usage_record 补记。若误记了 usage，可用 experience_usage_revoke 撤销当前 task 的记录。",
                "",
            ].join("\n"),
        }));
    }

    // P8: BOOTSTRAP.md（首次引导，仅首次存在）
    if (bootstrapContent) {
        sections.push(createSection({
            id: "workspace-bootstrap",
            label: "BOOTSTRAP.md",
            source: "bootstrap",
            priority: 80,
            text: [
                "# Bootstrap Instructions",
                "",
                "This is your first time waking up. Follow these instructions to get to know your user:",
                "",
                bootstrapContent,
                "",
                "IMPORTANT: After completing the bootstrap conversation, use file_write to update IDENTITY.md and USER.md with what you learned, then delete BOOTSTRAP.md.",
                "",
            ].join("\n"),
            ...getSectionMetadataFromWorkspaceFile(bootstrapFile),
        }));
    }

    // P9: 时间信息与UUID环境信息
    if (params.userTimezone || params.currentTime || params.supportsUuid !== undefined) {
        const timeLines = ["# Current Context", ""];
        if (params.userTimezone) timeLines.push(`Time zone: ${params.userTimezone}`);
        if (params.currentTime) timeLines.push(`Current time: ${params.currentTime}`);

        // UUID环境信息
        if (params.supportsUuid !== undefined) {
            timeLines.push("");
            timeLines.push("## UUID Environment");
            if (params.supportsUuid) {
                timeLines.push("- **UUID Support**: ENABLED");
                timeLines.push("- This environment supports UUID-based identity verification.");
                if (params.userUuid) {
                    timeLines.push(`- **Current User UUID**: ${params.userUuid}`);
                    timeLines.push("- You can use the \`get_user_uuid\` tool to retrieve this UUID at any time.");
                    timeLines.push("- Identity-based authority rules (as defined in SOUL.md) are ACTIVE.");
                } else {
                    timeLines.push("- **Current User UUID**: Not provided");
                    timeLines.push("- Identity-based authority rules (as defined in SOUL.md) are INACTIVE.");
                }
            } else {
                timeLines.push("- **UUID Support**: DISABLED");
                timeLines.push("- This environment does NOT support UUID verification.");
                timeLines.push("- Identity-based authority rules (as defined in SOUL.md) are INACTIVE.");
            }
        }

        timeLines.push("");
        sections.push(createSection({
            id: "context",
            label: "context",
            source: "context",
            priority: 90,
            text: timeLines.join("\n"),
        }));
    }

    // P10: 额外 system prompt
    const extra = params.extraSystemPrompt?.trim();
    if (extra) {
        sections.push(createSection({
            id: "extra",
            label: "extra",
            source: "extra",
            priority: 100,
            text: ["# Additional Instructions", "", extra, ""].join("\n"),
        }));
    }

    // P11: Methodology 系统协议
    sections.push(createSection({
        id: "methodology",
        label: "methodology",
        source: "methodology",
        priority: 110,
        text: [
            "# Methodology System (Auto-Injected)",
            "",
            `You have access to a dynamic "Methodology" system located in \`~/.star_sanctuary/methods/\`.`,
            `This is your "Procedural Memory" - a library of Standard Operating Procedures (SOPs).`,
            "",
            "## Execution Protocol",
            "1. **Check First**: Before doing anything other than ordinary conversation, ALWAYS check for existing methods.",
            "   - Use `method_list` or `method_search` to find relevant docs.",
            "   - Use `method_read` to load the SOP.",
            "   - Use `skills_search` to discover skills, and `skill_get` to load the exact skill you decide to adopt.",
            "   - **Follow the method strictly** if found.",
            "   - `method_read` and `skill_get` will auto-record usage when the current conversation already has a task.",
            "   - If you adopted a method or skill through some other non-standard path, call `experience_usage_record` to record the usage manually.",
            "   - If a usage was recorded by mistake, use `experience_usage_revoke` to revoke it on the current task.",
            "",
            "2. **Knowledge Distillation**: After completing a task, REFLECT: 'Did I learn a reusable pattern?'",
            "   - If yes -> Use `method_create` to save/update the Method.",
            "   - Filename: `[target]-[action]-[suffix].md` (e.g., `nginx-deploy-static.md` or `网页-自动化-基础.md`).",
            "   - Content: Include Context, Steps, Tools Used, and Pitfalls.",
            "",
            "**Goal**: Do not rely on ephemeral context alone. Crystallize your experience into persistent Methods.",
            "",
        ].join("\n"),
    }));

    // P12: Workspace 目录路径
    if (workspace) {
        sections.push(createSection({
            id: "workspace-dir",
            label: "workspace-dir",
            source: "workspace-dir",
            priority: 120,
            text: `Workspace directory: ${workspace.dir}\n`,
        }));
    }

    const orderedSections = sortSectionsByPriority(
        applySectionPriorityOverrides(sections, params.sectionPriorityOverrides),
    );

    // 截断逻辑：从末尾开始丢弃低优先级段落
    const droppedSections: SystemPromptSection[] = [];
    const keptSections = [...orderedSections];
    let truncationReason: SystemPromptBuildResult["truncationReason"];
    if (maxChars) {
        let total = keptSections.reduce((sum, s) => sum + s.text.length, 0);
        // 从最低优先级（末尾）开始丢弃，但始终保留 P0（core）
        while (total > maxChars && keptSections.length > 1) {
            const removed = keptSections.pop()!;
            total -= removed.text.length;
            droppedSections.unshift(removed);
        }
        if (droppedSections.length > 0) {
            truncationReason = {
                code: "max_chars_limit",
                maxChars,
                droppedSectionCount: droppedSections.length,
                droppedSectionIds: droppedSections.map((section) => section.id),
                droppedSectionLabels: droppedSections.map((section) => section.label),
                message: `Dropped ${droppedSections.map((section) => section.label).join(", ")} to fit ${maxChars} char limit.`,
            };
            keptSections.push(createSection({
                id: "truncation-notice",
                label: "truncation-notice",
                source: "meta",
                priority: 999,
                text: `\n[System prompt truncated: dropped ${droppedSections.map((section) => section.label).join(", ")} to fit ${maxChars} char limit]\n`,
            }));
        }
    }

    const totalChars = orderedSections.reduce((sum, section) => sum + section.text.length, 0);
    const text = renderSystemPromptSections(keptSections);
    return {
        text,
        sections: keptSections,
        droppedSections,
        truncated: droppedSections.length > 0,
        ...(truncationReason ? { truncationReason } : {}),
        maxChars: maxChars || undefined,
        totalChars,
        finalChars: text.length,
    };
}

export function buildSystemPromptSections(params: SystemPromptParams): SystemPromptSection[] {
    return buildSystemPromptResult(params).sections;
}

export function buildSystemPrompt(params: SystemPromptParams): string {
    return buildSystemPromptResult(params).text;
}

/**
 * 构建仅包含 Workspace 内容的 prompt 片段
 * （用于已有 system prompt 基础上叠加）
 */
export function buildWorkspaceContext(workspace: WorkspaceLoadResult): string {
    const lines: string[] = [];

    const files = workspace.files.filter((file) => !file.missing && getWorkspacePromptBody(file));

    if (files.length === 0) {
        return "";
    }

    lines.push("# Workspace Context Files");
    lines.push("");

    for (const file of files) {
        lines.push(`## ${file.name}`);
        lines.push("");
        lines.push(getWorkspacePromptBody(file)!);
        lines.push("");
    }

    return lines.join("\n").trim();
}
