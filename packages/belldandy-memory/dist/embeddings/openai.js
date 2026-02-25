import OpenAI from "openai";
export class OpenAIEmbeddingProvider {
    openai;
    modelName;
    dimension;
    queryPrefix;
    passagePrefix;
    constructor(options = {}) {
        this.openai = new OpenAI({
            apiKey: options.apiKey || process.env.OPENAI_API_KEY,
            baseURL: options.baseURL || process.env.OPENAI_BASE_URL,
        });
        this.modelName = options.model || "text-embedding-3-small";
        // text-embedding-3-small default is 1536, but can be scaled down. 3-large is 3072.
        this.dimension = options.dimension || 1536;
        this.queryPrefix = options.queryPrefix ?? "";
        this.passagePrefix = options.passagePrefix ?? "";
        console.log(`[Embedding] Initialized OpenAI provider with model: ${this.modelName}${this.queryPrefix ? ` (task-aware)` : ""}`);
    }
    async embed(text) {
        return this.embedQuery(text);
    }
    async embedQuery(text) {
        const input = this.queryPrefix ? this.queryPrefix + text : text;
        const response = await this.openai.embeddings.create({
            model: this.modelName,
            input,
            dimensions: this.modelName.includes("text-embedding-3") ? this.dimension : undefined,
        });
        return response.data[0].embedding;
    }
    async embedPassage(text) {
        const input = this.passagePrefix ? this.passagePrefix + text : text;
        const response = await this.openai.embeddings.create({
            model: this.modelName,
            input,
            dimensions: this.modelName.includes("text-embedding-3") ? this.dimension : undefined,
        });
        return response.data[0].embedding;
    }
    async embedBatch(texts) {
        // embedBatch 用于索引，默认使用 passage 前缀
        const inputs = this.passagePrefix
            ? texts.map(t => this.passagePrefix + t)
            : texts;
        const response = await this.openai.embeddings.create({
            model: this.modelName,
            input: inputs,
            dimensions: this.modelName.includes("text-embedding-3") ? this.dimension : undefined,
        });
        return response.data.map(d => d.embedding);
    }
}
//# sourceMappingURL=openai.js.map