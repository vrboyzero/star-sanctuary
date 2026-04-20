import type { Tool, JsonObject, ToolContext } from "../../types.js";
import { promises as fs } from "fs";
import * as path from "path";
import { getMethodsDir } from "./list.js";
import { isValidMethodFilename } from "./dir.js";

export const methodCreateTool: Tool = {
    definition: {
        name: "method_create",
        description: "创建或更新方法论文档。当任务完成并积累了经验（成功或失败）后，必须使用此工具沉淀方法。",
        parameters: {
            type: "object",
            properties: {
                filename: {
                    type: "string",
                    description: "文件名。中英文都必须遵守三段式规则：[目标对象]-[动作类型]-[细分].md，例如 'file-read-basic.md'、'网页-自动化-基础.md'"
                },
                content: {
                    type: "string",
                    description: "Markdown 格式的方法内容。必须包含元信息、适用场景、执行步骤、工具选择、失败经验等章节。"
                }
            },
            required: ["filename", "content"]
        }
    },
    execute: async (args: JsonObject, context: ToolContext) => {
        const filename = args.filename as string;
        const content = args.content as string;

        if (!filename || !content) {
            return {
                id: "error",
                name: "method_create",
                success: false,
                output: "缺少参数: filename 或 content",
                error: "Missing arguments",
                durationMs: 0
            };
        }

        if (!isValidMethodFilename(filename)) {
            return {
                id: "error",
                name: "method_create",
                success: false,
                output: `文件名 '${filename}' 不符合规范。method 文件名必须遵守三段式规则：[目标对象]-[动作类型]-[细分].md，例如：file-read-basic.md、网页-自动化-基础.md。`,
                error: "Invalid filename format",
                durationMs: 0
            };
        }

        const methodsDir = path.resolve(getMethodsDir(context));
        const filePath = path.resolve(methodsDir, filename);

        // 安全检查
        if (!filePath.startsWith(methodsDir + path.sep) && filePath !== methodsDir) {
            return { id: "error", name: "method_create", success: false, output: "Access Denied", error: "Path traversal", durationMs: 0 };
        }

        try {
            await fs.mkdir(methodsDir, { recursive: true });
            await fs.writeFile(filePath, content, "utf-8");

            return {
                id: "method_create",
                name: "method_create",
                success: true,
                output: `成功保存方法文档: ${filename}\n路径: ${filePath}`,
                durationMs: 0
            };
        } catch (error) {
            const err = error as Error;
            return {
                id: "error",
                name: "method_create",
                success: false,
                output: `保存方法失败: ${err.message}`,
                error: err.message,
                durationMs: 0
            };
        }
    }
};
