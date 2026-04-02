/**
 * switch_facet - FACET 模组热切换工具
 *
 * 在 SOUL.md 的锚点行之后，原子化替换为目标 facet 文件内容。
 * 锚点行及之前的内容保持不变。
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Tool, ToolContext, ToolCallResult, JsonObject } from "../types.js";
import { withToolContract } from "../tool-contract.js";

const DEFAULT_ANCHOR =
  "## **警告** FACET 模组 内容切换时，必须在这一行之后执行，不可覆盖替换这一行之前的内容。";

/** 列出 facets 目录下可用的模组名（不含后缀） */
async function listAvailableFacets(facetsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(facetsDir);
    return entries
      .filter((e) => e.endsWith(".md"))
      .map((e) => e.slice(0, -3));
  } catch {
    return [];
  }
}

/**
 * 根据 agentId 解析 SOUL.md 和 facets/ 的实际路径。
 * - agentId 为空或 "default" → 使用根目录
 * - 其他 → 使用 agents/{agentId}/ 子目录
 */
function resolveAgentPaths(stateDir: string, agentId?: string): { soulPath: string; facetsDir: string; label: string } {
  if (agentId && agentId !== "default") {
    const agentDir = path.join(stateDir, "agents", agentId);
    return {
      soulPath: path.join(agentDir, "SOUL.md"),
      facetsDir: path.join(agentDir, "facets"),
      label: `agents/${agentId}`,
    };
  }
  return {
    soulPath: path.join(stateDir, "SOUL.md"),
    facetsDir: path.join(stateDir, "facets"),
    label: "root",
  };
}

export const switchFacetTool: Tool = withToolContract({
  definition: {
    name: "switch_facet",
    description:
      "切换 SOUL.md 中的 FACET 职能模组。将锚点行之后的内容替换为指定模组文件的内容。模组文件位于 ~/.star_sanctuary/facets/（默认 Agent）或 ~/.star_sanctuary/agents/{id}/facets/（专属 Agent）目录。",
    parameters: {
      type: "object",
      properties: {
        facet_name: {
          type: "string",
          description: "目标模组文件名（不含 .md 后缀），例如 \"coder\"",
        },
      },
      required: ["facet_name"],
    },
  },

  async execute(args: JsonObject, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const name = "switch_facet";

    const makeError = (msg: string): ToolCallResult => ({
      id,
      name,
      success: false,
      output: "",
      error: msg,
      durationMs: Date.now() - start,
    });

    // ── 1. 参数校验 ──
    const facetName = args.facet_name;
    if (typeof facetName !== "string" || facetName.trim() === "") {
      return makeError("参数 facet_name 不能为空");
    }

    const sanitized = facetName.trim();
    // 防止路径穿越
    if (sanitized.includes("/") || sanitized.includes("\\") || sanitized.includes("..")) {
      return makeError("facet_name 包含非法字符");
    }

    // ── 2. 路径解析（感知 agentId） ──
    const stateDir = context.workspaceRoot; // ~/.star_sanctuary（默认）
    const { soulPath, facetsDir, label } = resolveAgentPaths(stateDir, context.agentId);
    const facetPath = path.join(facetsDir, `${sanitized}.md`);

    // ── 3. 校验 facet 文件存在 ──
    try {
      await fs.access(facetPath);
    } catch {
      const available = await listAvailableFacets(facetsDir);
      const hint = available.length > 0
        ? `可用模组: ${available.join(", ")}`
        : "facets 目录为空或不存在";
      return makeError(`模组文件不存在: facets/${sanitized}.md。${hint}`);
    }

    // ── 4. 读取 SOUL.md ──
    let soulContent: string;
    try {
      soulContent = await fs.readFile(soulPath, "utf-8");
    } catch {
      return makeError(`无法读取 SOUL.md (${label}): ${soulPath}`);
    }

    // ── 5. 查找锚点 ──
    const anchor = process.env.BELLDANDY_FACET_ANCHOR?.trim() || DEFAULT_ANCHOR;
    const lines = soulContent.split("\n");
    let anchorIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(anchor)) {
        anchorIndex = i;
        break;
      }
    }

    if (anchorIndex === -1) {
      return makeError(
        `未在 SOUL.md 中找到 FACET 切换锚点行。请确认文件中包含锚点: "${anchor}"`,
      );
    }

    // ── 6. 读取目标 facet 内容 ──
    let facetContent: string;
    try {
      facetContent = await fs.readFile(facetPath, "utf-8");
    } catch {
      return makeError(`无法读取模组文件: ${facetPath}`);
    }

    // ── 7. 拼接新内容：锚点行（含）之前 + 空行 + facet 内容 ──
    const preserved = lines.slice(0, anchorIndex + 1).join("\n");
    const newContent = preserved + "\n\n" + facetContent.trimEnd() + "\n";

    // ── 8. 原子写入 ──
    const tmpPath = soulPath + ".tmp";
    try {
      await fs.writeFile(tmpPath, newContent, "utf-8");
      await fs.rename(tmpPath, soulPath);
    } catch (err) {
      // 清理 tmp
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      return makeError(`写入 SOUL.md 失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    context.logger?.info(`FACET switched to "${sanitized}" (${label})`);

    return {
      id,
      name,
      success: true,
      output: `FACET 模组已切换为「${sanitized}」(${label})。SOUL.md 已更新，锚点行之前的内容保持不变。建议接下来调用 service_restart 重启服务以清空旧模组的推理惯性。`,
      durationMs: Date.now() - start,
    };
  },
}, {
  family: "service-admin",
  isReadOnly: false,
  isConcurrencySafe: false,
  needsPermission: true,
  riskLevel: "high",
  channels: ["gateway", "web"],
  safeScopes: ["privileged"],
  activityDescription: "Switch the active FACET module in SOUL.md",
  resultSchema: {
    kind: "text",
    description: "Facet switch result text.",
  },
  outputPersistencePolicy: "external-state",
});
