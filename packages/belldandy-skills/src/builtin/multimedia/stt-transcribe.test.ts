import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribeSpeech } from "./stt-transcribe.js";

// Mock OpenAI
const mockOpenAI = {
    audio: {
        transcriptions: {
            create: vi.fn(),
        },
    },
};

vi.mock("openai", () => {
    return {
        default: vi.fn(() => mockOpenAI),
        toFile: vi.fn(async (buf, name) => ({ name, type: "audio/mock" })),
    };
});

// Mock fetch for DashScope
global.fetch = vi.fn();

describe("stt-transcribe", () => {
    const mockBuffer = Buffer.from("mock-audio");

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.BELLDANDY_STT_PROVIDER = "";
        process.env.OPENAI_API_KEY = "sk-mock";
        process.env.DASHSCOPE_API_KEY = "sk-dashscope";
    });

    it("should use OpenAI by default", async () => {
        mockOpenAI.audio.transcriptions.create.mockResolvedValueOnce({
            text: "OpenAI Result",
            duration: 1.5,
        });

        const result = await transcribeSpeech({
            buffer: mockBuffer,
            fileName: "test.mp3",
        });

        expect(result).toEqual({
            text: "OpenAI Result",
            provider: "openai",
            model: "whisper-1",
            durationSec: 1.5,
        });
        expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith(
            expect.objectContaining({ model: "whisper-1" })
        );
    });

    it("should use Groq when configured", async () => {
        process.env.BELLDANDY_STT_PROVIDER = "groq";
        process.env.BELLDANDY_STT_GROQ_API_KEY = "gsk-mock";

        mockOpenAI.audio.transcriptions.create.mockResolvedValueOnce({
            text: "Groq Result",
            duration: 0.5,
        });

        const result = await transcribeSpeech({
            buffer: mockBuffer,
            fileName: "test.webm",
        });

        expect(result).toEqual({
            text: "Groq Result",
            provider: "groq",
            model: "whisper-large-v3-turbo",
            durationSec: 0.5,
        });
    });

    it("should use DashScope when configured", async () => {
        process.env.BELLDANDY_STT_PROVIDER = "dashscope";

        // 1. Submit task
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ output: { task_id: "task-123" } }),
        });

        // 2. Poll result (Success)
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                output: {
                    task_status: "SUCCEEDED",
                    results: [{ text: "DashScope Result" }]
                }
            }),
        });

        const result = await transcribeSpeech({
            buffer: mockBuffer,
            fileName: "test.wav",
        });

        expect(result).toEqual({
            text: "DashScope Result",
            provider: "dashscope",
            model: "paraformer-v2",
        });
    });

    it("should handle empty buffer", async () => {
        const result = await transcribeSpeech({
            buffer: Buffer.alloc(0),
            fileName: "empty.mp3",
        });
        expect(result).toBeNull();
    });
});
