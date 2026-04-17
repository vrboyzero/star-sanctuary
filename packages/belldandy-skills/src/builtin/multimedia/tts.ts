import type { Tool, ToolCallResult } from "../../types.js";
import crypto from "node:crypto";
import { synthesizeSpeech } from "./tts-synthesize.js";
import { isAbortError, readAbortReason, throwIfAborted } from "../../abort-utils.js";

export const textToSpeechTool: Tool = {
    definition: {
        name: "text_to_speech",
        description: "Convert text to spoken audio using OpenAI TTS, Edge TTS (Free), or DashScope (Aliyun).",
        parameters: {
            type: "object",
            properties: {
                input: {
                    type: "string",
                    description: "The text to generate audio for.",
                },
                provider: {
                    type: "string",
                    enum: ["openai", "edge", "dashscope"],
                    description: "TTS Provider: 'openai', 'edge' (free), or 'dashscope' (Aliyun). Default: 'edge'.",
                },
                voice: {
                    type: "string",
                    description: "Voice ID. OpenAI: 'alloy'. Edge: 'zh-CN-XiaoxiaoNeural'. DashScope: 'Cherry'. Default: Auto-selects.",
                },
                model: {
                    type: "string",
                    enum: ["tts-1", "tts-1-hd"],
                    description: "OpenAI model to use (default: tts-1). Ignored for Edge/DashScope.",
                },
            },
            required: ["input"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "text_to_speech";

        try {
            throwIfAborted(context.abortSignal);
            const result = await synthesizeSpeech({
                text: args.input as string,
                stateDir: context.workspaceRoot,
                provider: args.provider as string | undefined,
                voice: args.voice as string | undefined,
                model: args.model as string | undefined,
                abortSignal: context.abortSignal,
            });

            if (!result) {
                return {
                    id, name, success: false, output: "",
                    error: "TTS synthesis returned no result (empty input or all providers failed).",
                    durationMs: Date.now() - start,
                };
            }

            const provider = (args.provider as string) || process.env.BELLDANDY_TTS_PROVIDER || "edge";
            return {
                id, name, success: true,
                output: `Audio generated (${provider}):\n\n${result.htmlAudio}\n[Download](${result.webPath})`,
                durationMs: Date.now() - start,
            };
        } catch (err) {
            return {
                id, name, success: false, output: "",
                error: isAbortError(err) || context.abortSignal?.aborted
                    ? readAbortReason(context.abortSignal)
                    : (err instanceof Error ? err.message : String(err)),
                durationMs: Date.now() - start,
            };
        }
    },
};
