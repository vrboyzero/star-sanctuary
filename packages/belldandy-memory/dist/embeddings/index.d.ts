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
    readonly dimension?: number;
    readonly modelName?: string;
}
export type EmbeddingModel = EmbeddingProvider;
export declare function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number;
export declare function vectorToBuffer(vector: EmbeddingVector): Buffer;
export declare function vectorFromBuffer(buffer: Buffer): EmbeddingVector;
//# sourceMappingURL=index.d.ts.map