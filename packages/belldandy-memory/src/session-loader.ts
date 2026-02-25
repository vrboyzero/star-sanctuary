import fs from "node:fs/promises";
import { isNoise } from "./noise-filter.js";

/**
 * Extract text content from a session JSONL file
 * Formats data as:
 * User: ...
 * Assistant: ...
 * Noise messages (greetings, denials, boilerplate) are filtered out.
 */
export async function extractTextFromSession(filePath: string): Promise<string> {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n").filter(line => line.trim());
        const blocks: string[] = [];

        for (const line of lines) {
            try {
                const msg = JSON.parse(line);
                if (msg.role && msg.content) {
                    // 过滤噪声消息
                    if (isNoise(msg.content)) continue;

                    const roleName = msg.role === "user" ? "User" : "Assistant";
                    blocks.push(`${roleName}: ${msg.content}`);
                }
            } catch {
                // ignore
            }
        }

        return blocks.join("\n\n");
    } catch (err) {
        console.warn(`Failed to extract text from session ${filePath}`, err);
        return "";
    }
}
