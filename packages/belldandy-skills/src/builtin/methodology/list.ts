import type { Tool, JsonObject, ToolContext } from "../../types.js";
import { promises as fs } from "fs";
import * as path from "path";
import { resolveMethodsDir } from "./dir.js";
import { parseMethodContent } from "./meta.js";

export const getMethodsDir = (context?: Pick<ToolContext, "workspaceRoot">, env?: NodeJS.ProcessEnv) => resolveMethodsDir(context, env);

export const methodListTool: Tool = {
    definition: {
        name: "method_list",
        description: "列出所有可用的方法论文档 (Methods)。在开始复杂任务前，应该先调用此工具查看是否有现成的方法可供参考。",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    execute: async (_args: JsonObject, context: ToolContext) => {
        const methodsDir = getMethodsDir(context);
        try {
            await fs.mkdir(methodsDir, { recursive: true });
            const files = await fs.readdir(methodsDir);

            const mdFiles = files.filter(f => f.endsWith('.md'));

            if (mdFiles.length === 0) {
                return {
                    id: "method_list",
                    name: "method_list",
                    success: true,
                    output: "目前没有存储任何方法文档。请根据任务经验创建新的方法。",
                    durationMs: 0
                };
            }

            const entries: string[] = [];
            for (const file of mdFiles.sort((left, right) => left.localeCompare(right, "zh-CN"))) {
                const content = await fs.readFile(path.join(methodsDir, file), "utf-8");
                const parsed = parseMethodContent(content);
                const titlePart = parsed.title ? ` | 标题：${parsed.title}` : "";
                const statusPart = parsed.metadata.status ? ` | 状态：${parsed.metadata.status}` : "";
                const summaryPart = parsed.metadata.summary ? ` | 摘要：${parsed.metadata.summary}` : "";
                entries.push(`- ${file}${titlePart}${statusPart}${summaryPart}`);
            }

            return {
                id: "method_list",
                name: "method_list",
                success: true,
                output: `找到 ${mdFiles.length} 个方法文档:\n${entries.join("\n")}`,
                durationMs: 0
            };
        } catch (error) {
            const err = error as Error;
            return {
                id: "error",
                name: "method_list",
                success: false,
                output: `无法列出方法文件: ${err.message}`,
                error: err.message,
                durationMs: 0
            };
        }
    }
};

