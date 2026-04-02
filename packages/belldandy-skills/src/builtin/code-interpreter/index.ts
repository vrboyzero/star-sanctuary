import type { Tool, ToolCallResult } from "../../types.js";
import { PythonRunner } from "./python.js";
import { NodeRunner } from "./js.js";
import crypto from "node:crypto";
import { withToolContract } from "../../tool-contract.js";

export const codeInterpreterTool: Tool = withToolContract({
    definition: {
        name: "code_interpreter",
        description: "Execute Python or Node.js code in a temporary environment. Useful for calculations, data analysis, or generating text output via scripts. NOT a REPL (stateless per call, unless you write to files).",
        parameters: {
            type: "object",
            properties: {
                language: {
                    type: "string",
                    enum: ["python", "javascript"],
                    description: "Programming language to use.",
                },
                code: {
                    type: "string",
                    description: "The source code to execute.",
                },
            },
            required: ["language", "code"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "code_interpreter";

        const lang = args.language as string;
        const code = args.code as string;

        try {
            let result: { stdout: string; stderr: string };

            if (lang === "python") {
                const runner = new PythonRunner(context.workspaceRoot);
                result = await runner.run(code);
            } else if (lang === "javascript") {
                const runner = new NodeRunner(context.workspaceRoot);
                result = await runner.run(code);
            } else {
                throw new Error(`Unsupported language: ${lang}`);
            }

            return {
                id,
                name,
                success: result.stderr.length === 0, // Consider usage of stderr as 'failure' or just part of output? Usually scripts use stderr for errors.
                output: result.stdout + (result.stderr ? `\n[STDERR]\n${result.stderr}` : ""),
                durationMs: Date.now() - start,
            };

        } catch (err) {
            return {
                id,
                name,
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
}, {
    family: "command-exec",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: "high",
    channels: ["gateway", "web"],
    safeScopes: ["privileged"],
    activityDescription: "Execute Python or JavaScript code in a temporary interpreter",
    resultSchema: {
        kind: "text",
        description: "Interpreter stdout and stderr text.",
    },
    outputPersistencePolicy: "conversation",
});
