import type { FlagEmbedding } from "fastembed";
import { EmbeddingProvider } from "./index.js";
import { AuthenticationError, RateLimitError } from "../types.js";

export class LocalEmbeddingProvider implements EmbeddingProvider {
    private model: FlagEmbedding | null = null;
    readonly modelName: string;
    readonly cacheDir?: string;
    private initPromise: Promise<void> | null = null;

    constructor(modelName: string = "BAAI/bge-small-en-v1.5", cacheDir?: string) {
        this.modelName = modelName;
        this.cacheDir = cacheDir;
    }

    private async init() {
        if (this.model) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                if (this.cacheDir) {
                    const fs = await import("node:fs/promises");
                    const path = await import("node:path");
                    // [FIX] Create full model path including subdirectories (e.g., BAAI/bge-m3)
                    // fastembed expects this structure to exist
                    const modelSubdir = path.join(this.cacheDir, this.modelName.replace("/", path.sep));
                    await fs.mkdir(modelSubdir, { recursive: true });
                }

                const { FlagEmbedding } = await import("fastembed");
                this.model = await FlagEmbedding.init({
                    model: this.modelName as any,
                    cacheDir: this.cacheDir
                });
                console.log(`[LocalEmbedding] Initialized model: ${this.modelName} in ${this.cacheDir || "default cache"}`);
            } catch (err) {
                if (err instanceof Error && /Cannot find package 'fastembed'|Cannot find module 'fastembed'/.test(err.message)) {
                    throw new Error(
                        "Local embedding provider requires optional dependency 'fastembed'. Rebuild with optional native dependencies enabled.",
                    );
                }
                console.error(`[LocalEmbedding] Failed to initialize model ${this.modelName}:`, err);
                throw err;
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    }

    async embed(text: string): Promise<number[]> {
        await this.init();
        if (!this.model) throw new Error("Model not initialized");

        // fastembed returns a Generator of embeddings
        // embed function accepts string or string[]
        const embeddingsGenerator = this.model.embed([text]);
        const embeddings = [];
        for await (const batch of embeddingsGenerator) {
            embeddings.push(...batch);
        }

        if (embeddings.length === 0) {
            throw new Error("Failed to generate embedding");
        }

        return Array.from(embeddings[0]);
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        await this.init();
        if (!this.model) throw new Error("Model not initialized");

        const embeddingsGenerator = this.model.embed(texts);
        const allEmbeddings: number[][] = [];

        for await (const batch of embeddingsGenerator) {
            // batch is Float32Array[]
            for (const vec of batch) {
                allEmbeddings.push(Array.from(vec));
            }
        }

        return allEmbeddings;
    }
}
