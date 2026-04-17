import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveWorkspaceStateDir } from "@belldandy/protocol";
import { readAbortReason, throwIfAborted } from "../../abort-utils.js";

export class PythonRunner {
    private scratchDir: string;

    constructor(workspaceRoot: string) {
        this.scratchDir = path.join(resolveWorkspaceStateDir(workspaceRoot), "scratchpad");
    }

    async run(code: string, abortSignal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
        throwIfAborted(abortSignal);
        await fs.mkdir(this.scratchDir, { recursive: true });

        // Create a predictable filename or random one. Random is safer for concurrency.
        const filename = `script_${Date.now()}_${Math.random().toString(36).slice(2)}.py`;
        const filepath = path.join(this.scratchDir, filename);

        await fs.writeFile(filepath, code, "utf-8");
        throwIfAborted(abortSignal);

        return new Promise((resolve) => {
            // Run with unbuffered output (-u)
            const child = spawn("python3", ["-u", filepath], {
                cwd: this.scratchDir, // Set CWD to scratchpad so created files go there by default
            });

            let stdout = "";
            let stderr = "";
            let settled = false;

            const finalize = (result: { stdout: string; stderr: string }) => {
                if (settled) {
                    return;
                }
                settled = true;
                abortSignal?.removeEventListener("abort", onAbort);
                resolve(result);
            };

            const onAbort = () => {
                child.kill();
                finalize({ stdout, stderr: readAbortReason(abortSignal) });
            };

            abortSignal?.addEventListener("abort", onAbort, { once: true });

            child.stdout.on("data", (d) => { stdout += d.toString(); });
            child.stderr.on("data", (d) => { stderr += d.toString(); });

            // Timeout safety (e.g. 30s) could be added here, but for MVP we rely on Agent cancellation or Tool timeout

            child.on("close", () => {
                // Cleanup file asynchronously (optional, maybe keep for debugging?)
                // await fs.unlink(filepath).catch(() => {}); 
                // Let's keep it for now for "transparency"
                finalize({ stdout, stderr });
            });

            child.on("error", (err) => {
                if (abortSignal?.aborted) {
                    finalize({ stdout, stderr: readAbortReason(abortSignal) });
                    return;
                }
                finalize({ stdout: "", stderr: `Spawn Error: ${err.message}` });
            });
        });
    }
}
