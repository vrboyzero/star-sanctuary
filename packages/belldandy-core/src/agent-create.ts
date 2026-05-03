import fs from "node:fs/promises";
import path from "node:path";

import { ensureAgentWorkspace, loadAgentProfiles, type AgentConfigFile, type AgentProfile } from "@belldandy/agent";
import { resolveWorkspaceTemplateDir } from "@star-sanctuary/distribution";

type WriteTextFileAtomic = (
  filePath: string,
  content: string,
  options?: { ensureParent?: boolean; mode?: number },
) => Promise<void>;

export type CreateAgentInput = {
  stateDir: string;
  writeTextFileAtomic: WriteTextFileAtomic;
  id?: string;
  displayName?: string;
  model?: string;
  systemPromptOverride?: string;
};

export type CreateAgentResult = {
  agentId: string;
  configWritten: true;
  workspaceCreated: boolean;
  createdFiles: string[];
  createdDirectories: string[];
  requiresRestart: true;
};

type ExistingState = {
  agents: AgentProfile[];
  file: AgentConfigFile;
};

export class CreateAgentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CreateAgentError";
    this.code = code;
  }
}

const AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUICK_CREATE_TEMPLATE_DIRNAME = "experience-templates";
const AGENT_IDENTITY_TEMPLATE_FILENAME = "agent-identity.md";
const AGENT_SOUL_TEMPLATE_FILENAME = "agent-soul.md";

export async function createAgent(input: CreateAgentInput): Promise<CreateAgentResult> {
  const normalized = normalizeCreateAgentInput(input);
  const agentsFile = path.join(input.stateDir, "agents.json");
  const existing = await readExistingAgentsState(agentsFile);

  if (normalized.id === "default") {
    throw new CreateAgentError("invalid_agent_id", 'Agent id "default" is reserved.');
  }
  if (!AGENT_ID_PATTERN.test(normalized.id)) {
    throw new CreateAgentError(
      "invalid_agent_id",
      "Agent id must use lowercase letters, numbers, and hyphens only.",
    );
  }
  if (existing.agents.some((agent) => agent.id === normalized.id)) {
    throw new CreateAgentError("agent_exists", `Agent "${normalized.id}" already exists.`);
  }

  const nextProfile: AgentProfile = {
    id: normalized.id,
    displayName: normalized.displayName,
    model: normalized.model,
    systemPromptOverride: normalized.systemPromptOverride,
    kind: "resident",
    workspaceBinding: "current",
    workspaceDir: normalized.id,
    memoryMode: "hybrid",
    defaultRole: "default",
    toolsEnabled: true,
  };

  const nextConfig: AgentConfigFile = {
    agents: [...existing.file.agents, nextProfile],
  };
  await input.writeTextFileAtomic(agentsFile, `${JSON.stringify(nextConfig, null, 2)}\n`, { ensureParent: true });

  const workspace = await ensureAgentWorkspace({
    rootDir: input.stateDir,
    agentId: normalized.id,
  });
  const agentDir = path.join(input.stateDir, "agents", normalized.id);

  const identityPath = path.join(agentDir, "IDENTITY.md");
  const soulPath = path.join(agentDir, "SOUL.md");
  const createdFiles: string[] = [];
  const identityContent = await buildAgentIdentityMarkdown(input.stateDir, normalized);
  const soulContent = await buildAgentSoulMarkdown(input.stateDir, normalized);

  if (await writeIfMissing(input.writeTextFileAtomic, identityPath, identityContent)) {
    createdFiles.push("IDENTITY.md");
  }
  if (await writeIfMissing(input.writeTextFileAtomic, soulPath, soulContent)) {
    createdFiles.push("SOUL.md");
  }

  return {
    agentId: normalized.id,
    configWritten: true,
    workspaceCreated: workspace.created,
    createdFiles,
    createdDirectories: [
      toPosixRelative(path.relative(input.stateDir, agentDir)),
      toPosixRelative(path.relative(input.stateDir, path.join(agentDir, "facets"))),
    ],
    requiresRestart: true,
  };
}

async function readExistingAgentsState(filePath: string): Promise<ExistingState> {
  const profiles = await loadAgentProfiles(filePath);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(stripUtf8Bom(raw)) as unknown;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { agents?: unknown[] }).agents)) {
      return {
        agents: profiles,
        file: {
          agents: [...profiles],
        },
      };
    }
  } catch {
    // ignore and fall back to normalized profiles
  }

  return {
    agents: profiles,
    file: {
      agents: [...profiles],
    },
  };
}

function normalizeCreateAgentInput(input: CreateAgentInput) {
  const id = String(input.id ?? "").trim();
  const displayName = String(input.displayName ?? "").trim();
  const model = String(input.model ?? "").trim();
  const systemPromptOverride = String(input.systemPromptOverride ?? "").trim();

  if (!id) {
    throw new CreateAgentError("invalid_agent_id", "Agent id is required.");
  }
  if (!displayName) {
    throw new CreateAgentError("invalid_display_name", "Display name is required.");
  }
  if (!model) {
    throw new CreateAgentError("invalid_model", "Model is required.");
  }
  if (!systemPromptOverride) {
    throw new CreateAgentError("invalid_system_prompt", "Role description is required.");
  }

  return {
    id,
    displayName,
    model,
    systemPromptOverride,
  };
}

async function writeIfMissing(
  writeTextFileAtomic: WriteTextFileAtomic,
  filePath: string,
  content: string,
): Promise<boolean> {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await writeTextFileAtomic(filePath, content, { ensureParent: true });
    return true;
  }
}

async function buildAgentIdentityMarkdown(
  stateDir: string,
  input: { id: string; displayName: string; model: string; systemPromptOverride: string },
): Promise<string> {
  const templateContent = await resolveAgentQuickCreateTemplate(stateDir, "identity");
  if (!templateContent) {
    return buildIdentityMarkdownFallback(input);
  }
  return renderAgentQuickCreateTemplate("identity", templateContent, input);
}

async function buildAgentSoulMarkdown(
  stateDir: string,
  input: { id: string; displayName: string; model: string; systemPromptOverride: string },
): Promise<string> {
  const templateContent = await resolveAgentQuickCreateTemplate(stateDir, "soul");
  if (!templateContent) {
    return buildSoulMarkdownFallback(input);
  }
  return renderAgentQuickCreateTemplate("soul", templateContent, input);
}

async function resolveAgentQuickCreateTemplate(
  stateDir: string,
  kind: "identity" | "soul",
): Promise<string | null> {
  const fileName = kind === "identity"
    ? AGENT_IDENTITY_TEMPLATE_FILENAME
    : AGENT_SOUL_TEMPLATE_FILENAME;
  const fallbackName = kind === "identity" ? "IDENTITY.md" : "SOUL.md";
  const { templatesDir } = resolveWorkspaceTemplateDir({
    env: process.env,
    agentModuleUrl: import.meta.url,
  });
  const candidatePaths = [
    path.join(stateDir, QUICK_CREATE_TEMPLATE_DIRNAME, fileName),
    path.join(templatesDir, fallbackName),
  ];
  for (const candidatePath of candidatePaths) {
    const content = await fs.readFile(candidatePath, "utf-8").catch(() => "");
    if (content.trim()) {
      return content;
    }
  }
  return null;
}

function renderAgentQuickCreateTemplate(
  kind: "identity" | "soul",
  templateContent: string,
  input: { id: string; displayName: string; model: string; systemPromptOverride: string },
): string {
  const tokenMap: Record<string, string> = {
    "{{agentId}}": input.id,
    "{{displayName}}": input.displayName,
    "{{model}}": input.model,
    "{{systemPromptOverride}}": input.systemPromptOverride,
  };

  let rendered = templateContent;
  let personalized = false;

  for (const [token, value] of Object.entries(tokenMap)) {
    if (!rendered.includes(token)) continue;
    rendered = rendered.split(token).join(value);
    personalized = true;
  }

  if (kind === "identity") {
    const nameResult = replaceIdentityField(rendered, "名字", input.displayName);
    rendered = nameResult.content;
    personalized ||= nameResult.changed;

    const dutyResult = replaceIdentityField(rendered, "职责", input.systemPromptOverride);
    rendered = dutyResult.content;
    personalized ||= dutyResult.changed;
  } else {
    const nameResult = replaceSoulField(rendered, "名称", input.displayName);
    rendered = nameResult.content;
    personalized ||= nameResult.changed;

    const roleResult = replaceSoulField(rendered, "角色定位", input.systemPromptOverride);
    rendered = roleResult.content;
    personalized ||= roleResult.changed;
  }

  if (!personalized) {
    rendered = kind === "identity"
      ? appendMarkdownSection(rendered, buildIdentityMarkdownFallback(input))
      : insertBeforeFacetAnchor(rendered, buildSoulQuickCreateSection(input));
  } else if (kind === "soul" && !rendered.includes(input.systemPromptOverride)) {
    rendered = insertBeforeFacetAnchor(rendered, buildSoulQuickCreateSection(input));
  } else if (kind === "identity" && !rendered.includes(input.systemPromptOverride)) {
    rendered = appendMarkdownSection(rendered, buildIdentityQuickCreateSection(input));
  }

  return ensureTrailingNewline(rendered);
}

function buildIdentityMarkdownFallback(input: { displayName: string; systemPromptOverride: string }): string {
  return [
    `- **名字：** ${input.displayName}`,
    "",
    "## 身份说明",
    "",
    `${input.displayName} 是一个通过快捷创建生成的常驻 Agent。`,
    "",
    "## 职责摘要",
    "",
    input.systemPromptOverride,
    "",
  ].join("\n");
}

function buildSoulMarkdownFallback(input: { displayName: string; systemPromptOverride: string }): string {
  return [
    `# ${input.displayName}`,
    "",
    "## 核心定位",
    "",
    `${input.displayName} 是一个通过快捷创建生成的 Agent，默认遵循当前系统与工作区规则。`,
    "",
    "## 工作职责",
    "",
    input.systemPromptOverride,
    "",
    "## 行为要求",
    "",
    "- 优先执行明确任务。",
    "- 保持输出简洁、可操作、可解释。",
    "- 遇到不确定信息时先核对上下文，再继续行动。",
    "",
  ].join("\n");
}

function buildIdentityQuickCreateSection(input: { id: string; model: string; systemPromptOverride: string }): string {
  return [
    "## 快捷创建资料",
    "",
    `- **Agent ID：** ${input.id}`,
    `- **模型：** ${input.model}`,
    "",
    "## 职责摘要",
    "",
    input.systemPromptOverride,
  ].join("\n");
}

function buildSoulQuickCreateSection(input: { id: string; model: string; systemPromptOverride: string }): string {
  return [
    "## 【QUICK CREATE | 快捷创建补充】",
    "",
    `- **Agent ID：** ${input.id}`,
    `- **模型：** ${input.model}`,
    "",
    "### 本次创建的角色描述",
    "",
    input.systemPromptOverride,
    "",
  ].join("\n");
}

function replaceIdentityField(
  content: string,
  label: "名字" | "职责",
  value: string,
): { content: string; changed: boolean } {
  const pattern = new RegExp(
    `- \\*\\*${escapeRegExp(label)}：\\*\\*[\\t ]*(?:.*(?:\\r?\\n[ \\t]*\\*\\([^\\n]*\\)\\*)?)?`,
    "m",
  );
  if (!pattern.test(content)) {
    return { content, changed: false };
  }
  return {
    content: content.replace(pattern, formatMarkdownField(label, value)),
    changed: true,
  };
}

function replaceSoulField(
  content: string,
  label: "名称" | "角色定位",
  value: string,
): { content: string; changed: boolean } {
  const pattern = new RegExp(`- \\*\\*${escapeRegExp(label)}\\*\\*：.*$`, "m");
  if (!pattern.test(content)) {
    return { content, changed: false };
  }
  return {
    content: content.replace(pattern, formatMarkdownField(label, value)),
    changed: true,
  };
}

function formatMarkdownField(label: string, value: string): string {
  const lines = normalizeMultilineValue(value);
  if (lines.length === 0) {
    return `- **${label}：**`;
  }
  if (lines.length === 1) {
    return `- **${label}：** ${lines[0]}`;
  }
  return `- **${label}：** ${lines[0]}\n${lines.slice(1).map((line) => `  ${line}`).join("\n")}`;
}

function normalizeMultilineValue(value: string): string[] {
  return String(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function appendMarkdownSection(content: string, section: string): string {
  const normalized = content.trimEnd();
  return `${normalized}\n\n${section.trim()}\n`;
}

function insertBeforeFacetAnchor(content: string, section: string): string {
  const anchor = "<!-- FACET_ANCHOR -->";
  const index = content.indexOf(anchor);
  if (index < 0) {
    return appendMarkdownSection(content, section);
  }
  const before = content.slice(0, index);
  const after = content.slice(index);
  return `${before.trimEnd()}\n\n${section.trim()}\n\n${after}`;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripUtf8Bom(raw: string): string {
  return raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
}

function toPosixRelative(value: string): string {
  return value.split(path.sep).join("/");
}
