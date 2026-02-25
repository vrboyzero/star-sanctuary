import type { EmbeddingProvider, EmbeddingVector } from "./index.js";
export interface OpenAIEmbeddingOptions {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    dimension?: number;
    /**
     * Task-aware embedding 前缀。
     * 对于支持 task 参数的模型（如 Jina、BGE-M3），可配置 query/passage 前缀以提升检索相关性。
     * 例如 BGE 系列: queryPrefix="query: ", passagePrefix="passage: "
     * OpenAI 原生模型无需配置（留空即可）。
     */
    queryPrefix?: string;
    passagePrefix?: string;
}
export declare class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private openai;
    readonly modelName: string;
    readonly dimension: number;
    private queryPrefix;
    private passagePrefix;
    constructor(options?: OpenAIEmbeddingOptions);
    embed(text: string): Promise<EmbeddingVector>;
    embedQuery(text: string): Promise<EmbeddingVector>;
    embedPassage(text: string): Promise<EmbeddingVector>;
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}
//# sourceMappingURL=openai.d.ts.map