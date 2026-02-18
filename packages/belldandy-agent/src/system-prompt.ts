import type { WorkspaceFile, WorkspaceLoadResult } from "./workspace.js";
import { SOUL_FILENAME, IDENTITY_FILENAME, USER_FILENAME, BOOTSTRAP_FILENAME, AGENTS_FILENAME, TOOLS_FILENAME, MEMORY_FILENAME } from "./workspace.js";

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
};

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
export function buildSystemPrompt(params: SystemPromptParams): string {
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

    const shouldInjectAgents = params.injectAgents ?? true;
    const shouldInjectSoul = params.injectSoul ?? true;
    const shouldInjectMemory = params.injectMemory ?? true;

    // 按优先级构建段落列表（高优先级在前）
    // 截断时从末尾开始丢弃
    const sections: { label: string; text: string }[] = [];

    // P0: 核心身份声明（始终保留）
    sections.push({
        label: "core",
        text: "You are Belldandy, a personal AI assistant running locally on your user's device.\n",
    });

    // P1: AGENTS.md（工作空间指南）
    if (shouldInjectAgents && agentsFile?.content) {
        sections.push({
            label: "AGENTS.md",
            text: [
                "# Workspace Guide",
                "",
                "The following is your workspace guide - how to operate in this environment.",
                "",
                "---",
                "",
                agentsFile.content.trim(),
                "",
                "---",
                "",
            ].join("\n"),
        });
    }

    // P2: SOUL.md（人格准则）
    if (shouldInjectSoul && soulFile?.content) {
        sections.push({
            label: "SOUL.md",
            text: [
                "# Persona & Guidelines",
                "",
                "The following is your SOUL - your core personality and behavioral guidelines.",
                "Embody its persona and tone. Avoid stiff, generic replies; follow its guidance.",
                "",
                "---",
                "",
                soulFile.content.trim(),
                "",
                "---",
                "",
            ].join("\n"),
        });
    }

    // P3: USER.md
    if (userFile?.content) {
        sections.push({
            label: "USER.md",
            text: [
                "# Your User",
                "",
                "The following describes the person you are helping:",
                "",
                userFile.content.trim(),
                "",
            ].join("\n"),
        });
    }

    // P4: IDENTITY.md
    if (identityFile?.content) {
        sections.push({
            label: "IDENTITY.md",
            text: [
                "# Your Identity",
                "",
                "The following describes who you are:",
                "",
                identityFile.content.trim(),
                "",
            ].join("\n"),
        });
    }

    // P5: TOOLS.md
    if (toolsFile?.content) {
        sections.push({
            label: "TOOLS.md",
            text: [
                "# Tools & Local Setup",
                "",
                "The following contains local tool configuration and environment-specific notes:",
                "",
                toolsFile.content.trim(),
                "",
            ].join("\n"),
        });
    }

    // P6: MEMORY.md
    if (shouldInjectMemory && memoryFile?.content) {
        sections.push({
            label: "MEMORY.md",
            text: [
                "# Core Memory & Notes",
                "",
                "The following is your MEMORY - important facts, rules, or context to always remember.",
                "",
                "---",
                "",
                memoryFile.content.trim(),
                "",
                "---",
                "",
            ].join("\n"),
        });
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
                "你有更多专业技能存储在技能库中。当遇到不熟悉的领域时，请使用 skills_search 工具搜索可用技能。",
                "",
            );
        }

        if (injectedFull || params.hasSearchableSkills) {
            sections.push({ label: "skills", text: skillLines.join("\n") });
        }
    } else if (params.hasSearchableSkills) {
        sections.push({
            label: "skills",
            text: [
                "# Skills",
                "",
                "你有专业技能存储在技能库中。当遇到不熟悉的领域时，请使用 skills_search 工具搜索可用技能。",
                "",
            ].join("\n"),
        });
    }

    // P8: BOOTSTRAP.md（首次引导，仅首次存在）
    if (bootstrapFile?.content) {
        sections.push({
            label: "BOOTSTRAP.md",
            text: [
                "# Bootstrap Instructions",
                "",
                "This is your first time waking up. Follow these instructions to get to know your user:",
                "",
                bootstrapFile.content.trim(),
                "",
                "IMPORTANT: After completing the bootstrap conversation, use file_write to update IDENTITY.md and USER.md with what you learned, then delete BOOTSTRAP.md.",
                "",
            ].join("\n"),
        });
    }

    // P9: 时间信息
    if (params.userTimezone || params.currentTime) {
        const timeLines = ["# Current Context", ""];
        if (params.userTimezone) timeLines.push(`Time zone: ${params.userTimezone}`);
        if (params.currentTime) timeLines.push(`Current time: ${params.currentTime}`);
        timeLines.push("");
        sections.push({ label: "time", text: timeLines.join("\n") });
    }

    // P10: 额外 system prompt
    const extra = params.extraSystemPrompt?.trim();
    if (extra) {
        sections.push({
            label: "extra",
            text: ["# Additional Instructions", "", extra, ""].join("\n"),
        });
    }

    // P11: Methodology 系统协议
    sections.push({
        label: "methodology",
        text: [
            "# Methodology System (Auto-Injected)",
            "",
            `You have access to a dynamic "Methodology" system located in \`~/.belldandy/methods/\`.`,
            `This is your "Procedural Memory" - a library of Standard Operating Procedures (SOPs).`,
            "",
            "## Execution Protocol",
            "1. **Check First**: Before starting a complex task (e.g., system config, deployment), ALWAYS check for existing methods.",
            "   - Use `method_list` or `method_search` to find relevant docs.",
            "   - Use `method_read` to load the SOP.",
            "   - **Follow the method strictly** if found.",
            "",
            "2. **Knowledge Distillation**: After completing a task, REFLECT: 'Did I learn a reusable pattern?'",
            "   - If yes -> Use `method_create` to save/update the Method.",
            "   - Filename: `[Target]-[Action]-[Suffix].md` (e.g., `Nginx-deploy-static.md`).",
            "   - Content: Include Context, Steps, Tools Used, and Pitfalls.",
            "",
            "**Goal**: Do not rely on ephemeral context alone. Crystallize your experience into persistent Methods.",
            "",
        ].join("\n"),
    });

    // P12: Workspace 目录路径
    if (workspace) {
        sections.push({
            label: "workspace-dir",
            text: `Workspace directory: ${workspace.dir}\n`,
        });
    }

    // 截断逻辑：从末尾开始丢弃低优先级段落
    if (maxChars) {
        let total = sections.reduce((sum, s) => sum + s.text.length, 0);
        const dropped: string[] = [];
        // 从最低优先级（末尾）开始丢弃，但始终保留 P0（core）
        while (total > maxChars && sections.length > 1) {
            const removed = sections.pop()!;
            total -= removed.text.length;
            dropped.push(removed.label);
        }
        if (dropped.length > 0) {
            sections.push({
                label: "truncation-notice",
                text: `\n[System prompt truncated: dropped ${dropped.join(", ")} to fit ${maxChars} char limit]\n`,
            });
        }
    }

    return sections.map(s => s.text).join("\n").trim();
}

/**
 * 构建仅包含 Workspace 内容的 prompt 片段
 * （用于已有 system prompt 基础上叠加）
 */
export function buildWorkspaceContext(workspace: WorkspaceLoadResult): string {
    const lines: string[] = [];

    const files = workspace.files.filter(f => !f.missing && f.content);

    if (files.length === 0) {
        return "";
    }

    lines.push("# Workspace Context Files");
    lines.push("");

    for (const file of files) {
        lines.push(`## ${file.name}`);
        lines.push("");
        lines.push(file.content!.trim());
        lines.push("");
    }

    return lines.join("\n").trim();
}
