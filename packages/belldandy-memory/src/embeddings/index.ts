export type EmbeddingVector = number[];

export interface EmbeddingProvider {
    embed(text: string): Promise<EmbeddingVector>;
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
    /**
     * Task-aware embedding: 用于检索查询（retrieval.query）。
     * 对支持 task 参数的模型（Jina、BGE-M3 等），会使用 query 前缀/task 以提升检索相关性。
     * 不实现时回退到 embed()。
     */
    embedQuery?(text: string): Promise<EmbeddingVector>;
    /**
     * Task-aware embedding: 用于文档/段落索引（retrieval.passage）。
     * 不实现时回退到 embed()。
     */
    embedPassage?(text: string): Promise<EmbeddingVector>;
    // Optional metadata
    readonly dimension?: number;
    readonly modelName?: string;
}

// Deprecated alias for backward compatibility if needed, or just remove
export type EmbeddingModel = EmbeddingProvider;

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function vectorToBuffer(vector: EmbeddingVector): Buffer {
    return Buffer.from(new Float32Array(vector).buffer);
}

export function vectorFromBuffer(buffer: Buffer): EmbeddingVector {
    return Array.from(new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 4
    ));
}
